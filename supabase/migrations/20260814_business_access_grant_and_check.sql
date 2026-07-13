-- ============================================================
-- Fixes two gaps in the delegated business-login flow from
-- 20260809_business_delegated_login.sql. Run manually in Supabase SQL editor.
--
-- 1) grant_business_access() — BusinessAccess.tsx's "Add" form (grant by
--    mobile number, email, or @username) was calling this RPC, but it was
--    never defined in any migration, so granting access has been a hard
--    error all along. This creates it: owner-only, looks the grantee up by
--    phone, email, or their unique alias/username (users.alias — unique per
--    20260806_user_alias.sql), inserts (or reactivates) an ACTIVE
--    business_access_sessions row.
--
-- 2) has_business_access(business_id, uid) is already SECURITY DEFINER but
--    wasn't reachable directly from the client (only used inside RLS USING
--    clauses) — client code needs to re-validate "do I still have access"
--    right after a revoke/on dashboard load without relying on a write to
--    fail. Exposing it to `authenticated` (already granted) is enough; no
--    new function needed there. This migration just documents/confirms that
--    grant and adds a client-callable session lookup for "my access to a
--    specific business" so the UI can check it directly.
-- ============================================================

-- ── Owner: grant access to a customer by mobile number, email, or username ──
create or replace function public.grant_business_access(
  p_business_id text, p_identifier text
) returns table (grantee_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      text := auth.uid()::text;
  v_target   text;
  v_name     text;
  v_ident    text := trim(p_identifier);
  v_digits   text := regexp_replace(v_ident, '\D', '', 'g');
  v_biz_name text;
  v_session_id text;
begin
  if v_uid is null then raise exception 'Sign in to your STRYT account first.'; end if;

  select b.name into v_biz_name from public.businesses b
   where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_biz_name is null then raise exception 'Only the business owner can grant access.'; end if;

  -- Three identifier shapes, matched in order:
  --   1. Email — contains "@" followed later by a "." (a real domain), e.g. a@b.com.
  --   2. Phone — strips spaces/dashes/+ and what's left is 6+ digits only.
  --   3. Username/alias — anything else, matched case-insensitively against
  --      the unique users.alias column; a leading "@" (common handle
  --      convention, e.g. "@joslin") is stripped before matching.
  if v_ident ~ '@.*\.' then
    select id, name into v_target, v_name from public.users where lower(email) = lower(v_ident) limit 1;
  elsif regexp_replace(v_ident, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select id, name into v_target, v_name from public.users
     where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || right(v_digits, 10)
     limit 1;
  else
    select id, name into v_target, v_name from public.users
     where lower(alias) = lower(ltrim(v_ident, '@'))
     limit 1;
  end if;

  if v_target is null then
    raise exception 'No STRYT account found for that mobile number, email, or username.';
  end if;
  if v_target = v_uid then
    raise exception 'You already own this business.';
  end if;

  -- Reactivate an existing session for this grantee if one exists, else insert a fresh one.
  update public.business_access_sessions
     set status = 'ACTIVE', approved_at = now(), expires_at = null
   where business_id = p_business_id and grantee_user_id = v_target
  returning id into v_session_id;

  if v_session_id is null then
    insert into public.business_access_sessions (business_id, grantee_user_id, status, approved_at, expires_at)
    values (p_business_id, v_target, 'ACTIVE', now(), null)
    returning id into v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_target, 'QUEUE_UPDATE', 'Business access granted',
            'You can now manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
            '/account/business-access');
  exception when others then null; end;

  grantee_name := coalesce(v_name, 'User');
  return next;
end $$;
grant execute on function public.grant_business_access(text, text) to authenticated;

-- ── Client-callable: does the current user still have access to this business? ──
create or replace function public.my_business_access_status(p_business_id text)
returns boolean language sql security definer stable set search_path = public as $$
  select public.has_business_access(p_business_id, auth.uid()::text);
$$;
grant execute on function public.my_business_access_status(text) to authenticated;

-- ── Realtime so the switcher / dashboard react live to grant + revoke ──
do $$ begin
  alter publication supabase_realtime add table public.business_access_sessions;
exception when duplicate_object then null; when others then null; end $$;
