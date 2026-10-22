-- 20260998_phone_auth_bridge
--
-- Server-side support for the `firebase-phone-auth` edge function (Firebase SMS OTP -> Supabase session).
-- docs/plans/PHONE_AUTH_HARDENING_PLAN.md, Phases 1-3.
--
-- Why this exists
--   1. IDENTITY (plan G1/G5/G7). The first version of the edge function resolved "who is this phone?" by
--      reading public.users.phone. That column is contact information the client writes with no OTP behind it
--      (20260997, owner decision 2026-09-20), so anyone could plant a victim's number on their own profile and
--      have the victim's next phone login land in the attacker's account. Identity must come from the only
--      verified source: auth.users.phone, which the function itself sets after Firebase proves the number.
--      auth_user_id_by_phone() is that lookup. It also replaces auth.admin.listUsers(), which returns one page
--      (50 users) and silently stops finding people beyond it.
--   2. ABUSE (G2/G3). The function is unauthenticated (verify_jwt=false) and does several admin writes per
--      call. auth_bridge_attempts + bridge_rate_check() give it a per-IP and per-phone ceiling. Firebase
--      Blaze bills per SMS, so the limit also protects money.
--   3. RACES (G4). The function mints a session by rotating the user's password. Two simultaneous logins for the
--      same user would overwrite each other's temporary password. phone_login_lease serialises them.
--
-- public.users.phone is deliberately NOT given a unique index: it is unverified, so uniqueness would let an
-- attacker block a victim's number at onboarding. It stays contact info. See the plan, decision D4.
--
-- All three objects are service_role only. No client ever calls them.
--
-- Rollback: supabase/rollbacks/20260998_phone_auth_bridge.rollback.sql

begin;

-- ── 1. Verified-phone identity lookup ────────────────────────────────────────────────────────────────
-- auth.users.phone is stored as digits without '+' (e.g. 919876543210). Accept either form.
create or replace function public.auth_user_id_by_phone(p_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.id::text
  from auth.users a
  where nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') is not null
    and a.phone = regexp_replace(p_phone, '\D', '', 'g')
  order by a.created_at
  limit 1;
$$;

revoke all on function public.auth_user_id_by_phone(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_phone(text) to service_role;

-- ── 2. Rate limit ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.auth_bridge_attempts (
  id        bigint generated always as identity primary key,
  bucket    text not null check (bucket in ('ip', 'phone')),
  key_hash  text not null,                      -- sha-256 prefix; never a raw IP or phone number
  at        timestamptz not null default now()
);

create index if not exists auth_bridge_attempts_lookup
  on public.auth_bridge_attempts (bucket, key_hash, at desc);

alter table public.auth_bridge_attempts enable row level security;
revoke all on table public.auth_bridge_attempts from public, anon, authenticated;

-- Returns true when the attempt is allowed (and records it), false when the caller is over the limit.
-- A typed return rather than an exception, so the insert is not rolled back (same lesson as 20260823).
-- Rejected attempts are not recorded: probing during a lockout does not extend it.
create or replace function public.bridge_rate_check(
  p_bucket   text,
  p_key_hash text,
  p_limit    integer,
  p_window   interval
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_bucket not in ('ip', 'phone') or coalesce(p_key_hash, '') = '' or p_limit < 1 then
    return false;
  end if;

  -- Serialise concurrent checks for the same key so two requests cannot both read "limit - 1".
  perform pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_key_hash, 0));

  select count(*) into v_count
  from public.auth_bridge_attempts
  where bucket = p_bucket and key_hash = p_key_hash and at > now() - p_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.auth_bridge_attempts (bucket, key_hash) values (p_bucket, p_key_hash);

  -- Housekeeping: rows older than a day are never read. Do it on ~2% of calls, not every call.
  if random() < 0.02 then
    delete from public.auth_bridge_attempts where at < now() - interval '1 day';
  end if;

  return true;
end;
$$;

revoke all on function public.bridge_rate_check(text, text, integer, interval) from public, anon, authenticated;
grant execute on function public.bridge_rate_check(text, text, integer, interval) to service_role;

-- ── 3. Per-user lease ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.phone_login_lease (
  user_id      text primary key,
  leased_until timestamptz not null
);

alter table public.phone_login_lease enable row level security;
revoke all on table public.phone_login_lease from public, anon, authenticated;

-- true = this caller now holds the lease; false = another sign-in for this user is in progress.
-- An expired lease is taken over, so a crashed function cannot lock a user out for longer than p_seconds.
create or replace function public.try_lease_phone_login(p_user_id text, p_seconds integer default 15)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if coalesce(p_user_id, '') = '' then
    return false;
  end if;

  insert into public.phone_login_lease (user_id, leased_until)
  values (p_user_id, now() + make_interval(secs => greatest(p_seconds, 1)))
  on conflict (user_id) do update
    set leased_until = excluded.leased_until
    where public.phone_login_lease.leased_until < now();

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.release_phone_login(p_user_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.phone_login_lease where user_id = p_user_id;
$$;

revoke all on function public.try_lease_phone_login(text, integer) from public, anon, authenticated;
revoke all on function public.release_phone_login(text) from public, anon, authenticated;
grant execute on function public.try_lease_phone_login(text, integer) to service_role;
grant execute on function public.release_phone_login(text) to service_role;

notify pgrst, 'reload schema';

commit;

-- Verify (as service_role):
--   select public.auth_user_id_by_phone('+919000000001');   -> that user's uid; same for '919000000001'
--   select public.auth_user_id_by_phone('');                -> null
--   select public.bridge_rate_check('ip','t',2,'1 minute'); -> t, t, f
--   select public.try_lease_phone_login('u1');              -> t ; again -> f ; after release -> t
-- Verify (as authenticated / anon): every call above must fail with "permission denied for function".
