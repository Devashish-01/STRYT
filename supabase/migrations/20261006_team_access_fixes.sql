-- ============================================================
-- 20261006 — Team Access & Delegated Login Fixes
--
-- Fixes critical issues identified in TEAM_ACCESS_ARCHITECTURE_AND_FLOW.md:
--   1. TMA-EXP-01: Fix 30-second approval expiration trap. Pending shop login
--      requests now have a realistic 24-hour expiration window instead of
--      expiring in 30 seconds before the owner can review them.
--   2. TMA-SCOPE-01: Bind scopes to shop login credentials. Staff signing in
--      via terminal login now receive the scopes configured by the owner
--      (defaulting to operational scopes) instead of unconstrained FULL access.
--   3. TMA-NOTIF-01: Fix notification type in grant_business_access from
--      QUEUE_UPDATE to BUSINESS_ACCESS for consistency with all other grant RPCs.
--   4. TMA-AVAIL-01: Add dedicated set_business_availability RPC so active team
--      members can toggle open/closed status safely without needing full
--      table-level UPDATE permissions on public.businesses.
--   5. TMA-SEC-01: Restrict public.businesses UPDATE policy strictly to owner
--      and platform admins, eliminating the privilege escalation leak where
--      FULL delegates could overwrite business profile, banking, and legal data.
-- ============================================================

-- ── 1. Add scopes & access_level to business_login_credentials ──────────────
alter table public.business_login_credentials
  add column if not exists access_level text not null default 'SCOPED' check (access_level in ('FULL','SCOPED')),
  add column if not exists scopes text[] not null default '{"appointments","queue","catalog","leads"}';

-- ── 2. Owner: set/update business login with scopes support ─────────────────
create or replace function public.set_business_login(
  p_business_id text,
  p_login_id text,
  p_password text,
  p_require_approval boolean,
  p_session_hours int,
  p_enabled boolean,
  p_access_level text default 'SCOPED',
  p_scopes text[] default '{"appointments","queue","catalog","leads"}'
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_scopes text[];
  v_level text;
begin
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = auth.uid()::text) then
    raise exception 'Only the business owner can set login access.';
  end if;

  v_level := case when p_access_level = 'FULL' then 'FULL' else 'SCOPED' end;
  v_scopes := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                         where s in ('appointments','queue','catalog','leads','delivery')), '{}');
  if v_level = 'SCOPED' and array_length(v_scopes, 1) is null then
    v_scopes := array['appointments','queue','catalog','leads'];
  end if;

  insert into public.business_login_credentials (
    business_id, login_id, password_hash, require_approval, session_hours, is_enabled,
    access_level, scopes, updated_at
  )
  values (
    p_business_id, trim(p_login_id), crypt(nullif(p_password, ''), gen_salt('bf')),
    p_require_approval, greatest(1, least(p_session_hours, 720)), p_enabled,
    v_level, v_scopes, now()
  )
  on conflict (business_id) do update set
    login_id = excluded.login_id,
    password_hash = case when coalesce(p_password, '') <> '' then crypt(p_password, gen_salt('bf')) else public.business_login_credentials.password_hash end,
    require_approval = excluded.require_approval,
    session_hours = excluded.session_hours,
    is_enabled = excluded.is_enabled,
    access_level = excluded.access_level,
    scopes = excluded.scopes,
    updated_at = now();
end $$;

revoke execute on function public.set_business_login(text, text, text, boolean, int, boolean, text, text[]) from public, anon;
grant execute on function public.set_business_login(text, text, text, boolean, int, boolean, text, text[]) to authenticated;

-- ── 3. Staff: business_login_attempt with 24h approval & scoped session ─────
create or replace function public.business_login_attempt(p_login_id text, p_password text)
returns table (status text, business_id text, session_id uuid, business_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_login_key text := lower(trim(coalesce(p_login_id, '')));
  v_attempt public.business_login_attempts%rowtype;
  v_cred public.business_login_credentials%rowtype;
  v_owner text;
  v_name text;
  v_grantee text;
  v_existing public.business_access_sessions%rowtype;
  v_status text;
  v_expires timestamptz;
  v_id uuid;
  v_hash text;
  v_password_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_login_key = '' then
    return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
      'Invalid login id or password'::text;
    return;
  end if;

  select * into v_attempt
  from public.business_login_attempts
  where login_id = v_login_key and attempted_by = v_uid
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return query select 'LOCKED'::text, null::text, null::uuid,
      ('Too many failed attempts. Try again in ' ||
       greatest(1, ceil(extract(epoch from (v_attempt.locked_until - now())) / 60)::integer) ||
       ' minute(s).')::text;
    return;
  end if;

  select * into v_cred
  from public.business_login_credentials c
  where lower(trim(c.login_id)) = v_login_key and c.is_enabled = true;

  v_hash := coalesce(nullif(v_cred.password_hash, ''), v_dummy_hash);
  v_password_matches := crypt(coalesce(p_password, ''), v_hash) = v_hash;

  if v_cred.business_id is null or p_password is null or not v_password_matches then
    insert into public.business_login_attempts
      (login_id, attempted_by, fail_count, last_attempt_at, locked_until)
    values (v_login_key, v_uid, 1, now(), null)
    on conflict (login_id, attempted_by) do update
    set fail_count = case
          when business_login_attempts.last_attempt_at <= now() - v_window
            or business_login_attempts.locked_until is not null
          then 1 else business_login_attempts.fail_count + 1 end,
        last_attempt_at = now(),
        locked_until = case
          when (case
            when business_login_attempts.last_attempt_at <= now() - v_window
              or business_login_attempts.locked_until is not null
            then 1 else business_login_attempts.fail_count + 1 end) >= v_max_attempts
          then now() + v_window else null end
    returning * into v_attempt;

    if v_attempt.locked_until is not null then
      return query select 'LOCKED'::text, null::text, null::uuid,
        'Too many failed attempts. Try again in 15 minutes.'::text;
    else
      return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
        'Invalid login id or password'::text;
    end if;
    return;
  end if;

  delete from public.business_login_attempts
  where login_id = v_login_key and attempted_by = v_uid;

  select b.owner_user_id, b.name into v_owner, v_name
  from public.businesses b where b.id = v_cred.business_id;
  if v_owner = v_uid then
    raise exception 'You already own this business';
  end if;

  select coalesce(nullif(trim(u.alias), ''), u.name, 'Someone') into v_grantee
  from public.users u where u.id = v_uid;

  select * into v_existing
  from public.business_access_sessions s
  where s.business_id = v_cred.business_id and s.grantee_user_id = v_uid
    and s.status in ('PENDING', 'ACTIVE')
    and (s.expires_at is null or s.expires_at > now())
  order by s.requested_at desc limit 1;

  if v_existing.id is not null then
    return query select v_existing.status, v_existing.business_id, v_existing.id, v_name;
    return;
  end if;

  if v_cred.require_approval then
    v_status := 'PENDING';
    -- TMA-EXP-01: 24-hour expiration replaces the 30-second trap
    v_expires := now() + interval '24 hours';
  else
    v_status := 'ACTIVE';
    v_expires := now() + make_interval(hours => coalesce(v_cred.session_hours, 8));
  end if;

  -- TMA-SCOPE-01: Propagate owner-configured access_level and scopes to the session
  insert into public.business_access_sessions
    (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
  values (
    v_cred.business_id, v_uid, v_status,
    case when v_status = 'ACTIVE' then now() else null end,
    v_expires,
    coalesce(v_cred.access_level, 'SCOPED'),
    coalesce(v_cred.scopes, '{"appointments","queue","catalog","leads"}')
  )
  returning id into v_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_owner, 'BUSINESS_ACCESS',
      case when v_status = 'PENDING' then 'Access request' else 'Business login' end,
      v_grantee || case when v_status = 'PENDING'
        then ' wants to manage ' || coalesce(v_name, 'your business') || '. Review in Team & access.'
        else ' logged in to manage ' || coalesce(v_name, 'your business') || '.' end,
      '/account/business-access'
    );
  exception when others then null;
  end;

  return query select v_status, v_cred.business_id, v_id, v_name;
end
$$;

revoke execute on function public.business_login_attempt(text, text) from public, anon;
grant execute on function public.business_login_attempt(text, text) to authenticated;

-- ── 4. Fix notification type in grant_business_access (QUEUE_UPDATE -> BUSINESS_ACCESS) ──
create or replace function public.grant_business_access(
  p_business_id text, p_identifier text
) returns table (session_id uuid, grantee_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      text := auth.uid()::text;
  v_target   text;
  v_name     text;
  v_ident    text := trim(p_identifier);
  v_digits   text := regexp_replace(v_ident, '\D', '', 'g');
  v_biz_name text;
  v_session_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to your STRYT account first.'; end if;

  select b.name into v_biz_name from public.businesses b
   where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_biz_name is null then raise exception 'Only the business owner can grant access.'; end if;

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
           access_level = 'FULL', scopes = '{}'
     where id = v_session_id;
  else
    insert into public.business_access_sessions (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
    values (p_business_id, v_target, 'ACTIVE', now(), null, 'FULL', '{}')
    returning id into v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_target, 'BUSINESS_ACCESS', 'Business access granted',
            'You can now manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
            '/account/business-access');
  exception when others then null; end;

  session_id := v_session_id;
  grantee_name := coalesce(v_name, 'User');
  return next;
end $$;

revoke execute on function public.grant_business_access(text, text) from public, anon;
grant execute on function public.grant_business_access(text, text) to authenticated;

-- ── 5. Safe availability toggle RPC for console managers (owner & active team) ──
create or replace function public.set_business_availability(
  p_business_id text,
  p_available_now boolean,
  p_available_until timestamptz default null
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.has_business_access(p_business_id, auth.uid()::text) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.businesses
     set is_available_now = p_available_now,
         available_until = case when p_available_now then p_available_until else null end,
         updated_at = now()
   where id = p_business_id;
end $$;

revoke execute on function public.set_business_availability(text, boolean, timestamptz) from public, anon;
grant execute on function public.set_business_availability(text, boolean, timestamptz) to authenticated;

-- ── 6. Tighten businesses UPDATE policy to owner and admin only ──────────────
drop policy if exists admin_upd_businesses on public.businesses;
create policy admin_upd_businesses on public.businesses for update
  using (
    exists (select 1 from public.users where users.id = (select auth.uid())::text and 'admin' = any(users.roles))
    or owner_user_id = (select auth.uid())::text
  )
  with check (
    exists (select 1 from public.users where users.id = (select auth.uid())::text and 'admin' = any(users.roles))
    or owner_user_id = (select auth.uid())::text
  );
