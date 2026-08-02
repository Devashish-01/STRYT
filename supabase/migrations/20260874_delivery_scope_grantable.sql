-- TMA-005 / DLV-002 — the `delivery` scope existed everywhere except where it
-- mattered.
--
-- `Scope`, `SCOPE_LABELS`, `SCOPE_ORDER`, `useAccountOptions` and
-- `RequireDeliveryAgent` all treat `delivery` as a grantable scope, and a
-- comment in businessAccessService claimed "the DB grant whitelist +
-- has_business_scope already accept it". Verified against the live DB: they do
-- not. Both grant functions filter the incoming array down to
-- ('appointments','queue','catalog','leads'), so `delivery` was silently
-- dropped — the grant appeared to succeed while granting nothing.
--
-- Consequence: the Delivery hat could only ever appear via
-- `count_my_active_deliveries() > 0`, so an agent with no current assignment
-- couldn't open /delivery at all — including to set themselves ON duty, which
-- is what makes them assignable in the first place. `hasDeliveryScope` in
-- RequireDeliveryAgent was dead code.
--
-- Decision (D1): standing delivery agents. An owner can grant the delivery hat
-- permanently.
--
-- BOTH functions are widened here. Widening only the grant would let a
-- delivery grant be created and then silently stripped the first time the
-- owner edited that member's scopes — exactly the class of half-fix that
-- produced this finding.
--
-- Only the whitelist line changes in each; the rest of both bodies is
-- reproduced verbatim from the live definitions (pg_get_functiondef) so this
-- migration can't quietly revert unrelated logic.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `delivery_scope_grantable`.

create or replace function public.grant_team_member_access(
  p_business_id text, p_identifier text, p_scopes text[]
) returns table(session_id uuid, grantee_name text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid      text := auth.uid()::text;
  v_target   text;
  v_name     text;
  v_ident    text := trim(p_identifier);
  v_digits   text := regexp_replace(v_ident, '\D', '', 'g');
  v_biz_name text;
  v_session_id uuid;
  v_scopes   text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                   where s in ('appointments','queue','catalog','leads','delivery')), '{}');
begin
  if v_uid is null then raise exception 'Sign in to your STRYT account first.'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  select b.name into v_biz_name from public.businesses b
   where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_biz_name is null then raise exception 'Only the business owner can add team members.'; end if;

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

  update public.business_access_sessions
     set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
   where business_id = p_business_id and grantee_user_id = v_target
     and status in ('PENDING', 'ACTIVE')
     and expires_at is not null and expires_at <= now();

  select id into v_session_id
  from public.business_access_sessions
  where business_id = p_business_id and grantee_user_id = v_target
    and status in ('PENDING', 'ACTIVE')
  order by requested_at desc, id desc
  limit 1 for update;

  if v_session_id is not null then
    update public.business_access_sessions
       set status = 'ACTIVE', decided_at = now(), expires_at = null,
           access_level = 'SCOPED', scopes = v_scopes
     where id = v_session_id;
  else
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
    values (p_business_id, v_target, 'ACTIVE', now(), null, 'SCOPED', v_scopes)
    returning id into v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_target, 'QUEUE_UPDATE', 'Team access granted',
            'You can now help manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
            '/account/business-access');
  exception when others then null; end;

  session_id := v_session_id;
  grantee_name := coalesce(v_name, 'User');
  return next;
end $function$;

create or replace function public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid text := auth.uid()::text;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads','delivery')), '{}');
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;
  update public.business_access_sessions s
     set access_level = 'SCOPED', scopes = v_scopes
    from public.businesses b
   where s.id = p_session_id and b.id = s.business_id and b.owner_user_id = v_uid
     and s.status = 'ACTIVE';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $function$;
