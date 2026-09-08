-- ============================================================
-- 20260934 — TEAM_ACCESS #4: the three team-access notifications were typed
-- 'QUEUE_UPDATE'.
--
-- BUSINESS_ACCESS is the right type and already exists everywhere it needs to:
-- in the NotificationType union, with an icon mapped in Notifications.tsx, and
-- as the type every older migration in this area uses (20260823, 20260824,
-- 20260840). These three regressed to QUEUE_UPDATE when they were written.
--
-- Beyond the wrong icon and colour, notification_preferences keys off the type
-- — so a user who muted queue updates was silently opted out of being told when
-- their access to a business was granted, changed, or removed. Access changes
-- are not something anyone should be able to mute by accident.
--
-- Only the notification insert differs in each function; the surrounding logic
-- is reproduced unchanged from the live definitions.
-- ============================================================

create or replace function public.grant_team_member_access(p_business_id text, p_identifier text, p_scopes text[])
returns table(session_id uuid, grantee_name text)
language plpgsql security definer
set search_path = public
as $fn$
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
    values (v_target, 'BUSINESS_ACCESS', 'Team access granted',
            'You can now help manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
            '/account/business-access');
  exception when others then null; end;

  session_id := v_session_id;
  grantee_name := coalesce(v_name, 'User');
  return next;
end $fn$;


create or replace function public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
returns void
language plpgsql security definer
set search_path = public
as $fn$
declare
  v_uid text := auth.uid()::text;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads','delivery')), '{}');
  v_grantee text;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  update public.business_access_sessions s
     set access_level = 'SCOPED', scopes = v_scopes
    from public.businesses b
   where s.id = p_session_id and b.id = s.business_id and b.owner_user_id = v_uid
     and s.status = 'ACTIVE'
  returning s.grantee_user_id, b.name into v_grantee, v_biz_name;
  if not found then raise exception 'NOT_ALLOWED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_grantee, 'BUSINESS_ACCESS', 'Access updated',
            'Your access to ' || coalesce(v_biz_name, 'a business') || ' was changed by the owner.',
            '/account/business-access');
  exception when others then null; end;
end $fn$;


create or replace function public.revoke_business_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $fn$
declare
  v_uid text := auth.uid()::text;
  v_session public.business_access_sessions%rowtype;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_session
  from public.business_access_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.grantee_user_id is distinct from v_uid
     and not exists (
       select 1 from public.businesses b
       where b.id = v_session.business_id and b.owner_user_id = v_uid
     ) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.business_access_sessions
  set status = 'REVOKED', decided_at = now(),
      expires_at = case when status = 'ACTIVE' then now() else expires_at end
  where id = p_session_id and status in ('PENDING', 'ACTIVE');

  -- Only when the OWNER revoked someone ELSE's access — a grantee revoking
  -- their own (leaving the team) doesn't need to be told they did the thing
  -- they just did.
  if v_uid is distinct from v_session.grantee_user_id then
    select name into v_biz_name from public.businesses where id = v_session.business_id;
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_session.grantee_user_id, 'BUSINESS_ACCESS', 'Access removed',
              'Your access to ' || coalesce(v_biz_name, 'a business') || ' was removed.',
              '/account/business-access');
    exception when others then null; end;
  end if;
end $fn$;
