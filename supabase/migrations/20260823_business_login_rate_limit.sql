-- ============================================================
-- 20260823 — Transaction-safe delegated business-login rate limit
--
-- The first live rate-limit implementation raised after recording a failure.
-- PostgreSQL rolled that statement back, including the counter update. Expected
-- failures now return a typed row so the write commits; only authentication
-- failures that have no state to preserve raise exceptions.
-- ============================================================

create table if not exists public.business_login_attempts (
  login_id       text not null,
  attempted_by   text not null references public.users(id) on delete cascade,
  fail_count     integer not null default 0,
  locked_until   timestamptz,
  last_attempt_at timestamptz not null default now(),
  primary key (login_id, attempted_by)
);

alter table public.business_login_attempts enable row level security;
revoke all on table public.business_login_attempts from public, anon, authenticated;

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

  -- Empty identifiers are invalid but intentionally do not create a shared
  -- sentinel row that could let unrelated callers lock one another out.
  if v_login_key = '' then
    return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
      'Invalid login id or password'::text;
    return;
  end if;

  -- Serialize attempts for this login/user pair. A lock already in force is
  -- fixed-duration; probing during it does not extend the denial indefinitely.
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

  -- Always run one bcrypt comparison. The dummy hash reduces the timing signal
  -- that would otherwise reveal whether a login id exists.
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

  -- A successful authentication clears this pair's failure history.
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
    v_expires := now() + interval '30 seconds';
  else
    v_status := 'ACTIVE';
    v_expires := now() + make_interval(hours => v_cred.session_hours);
  end if;

  insert into public.business_access_sessions
    (business_id, grantee_user_id, status, decided_at, expires_at)
  values (v_cred.business_id, v_uid, v_status,
          case when v_status = 'ACTIVE' then now() else null end, v_expires)
  returning id into v_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_owner, 'BUSINESS_ACCESS',
      case when v_status = 'PENDING' then 'Access request' else 'Business login' end,
      v_grantee || case when v_status = 'PENDING'
        then ' wants to manage ' || coalesce(v_name, 'your business') || '. Approve within 30 seconds.'
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
