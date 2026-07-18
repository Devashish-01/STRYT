-- ============================================================
-- 20260827 — Security advisor hardening pass
--
-- Closes findings from mcp__supabase__get_advisors (security):
--
-- 1. resolve_admin_email was a free, unlimited, unauthenticated oracle:
--    anyone could POST any guessed login_id and get back the real admin
--    email address in the response body (regardless of what the UI does
--    with it). Fixed with the same per-identifier rate-limit pattern
--    already used by business_login_attempt (20260823) — 5 tries per
--    login_id per 15 minutes, then the RPC behaves identically to "not
--    found" until the window clears. Does not require auth (the admin
--    login flow calls this *before* signing in), so it can't be closed
--    by just requiring `authenticated`.
--
-- 2. function_search_path_mutable (11 functions): none pinned
--    `search_path`, which is the classic SECURITY DEFINER search-path
--    hijack vector (a malicious `public` schema object shadowing an
--    unqualified reference). Pinned each to `search_path = public`.
--
-- 3. public_bucket_allows_listing (uploads, app-updates): both buckets
--    had a broad `SELECT ... USING (true)` policy on storage.objects.
--    Public buckets don't need a SELECT policy for object GET by known
--    path/URL — `bucket.public = true` already serves that without any
--    RLS check. The only effect of the broad policy was to let anyone
--    call storage `.list()` and enumerate every file in the bucket.
--    Confirmed via grep that no app code calls `.list()` on either
--    bucket, so dropping it changes nothing functionally.
--
-- NOT fixed here (see GOAL_LIVE.md / chat for why):
--  - rls_disabled_in_public on spatial_ref_sys: owned by supabase_admin
--    (PostGIS extension table), our migration role can't ALTER it.
--    Contains no user data (EPSG coordinate system defs only) — a
--    widely-acknowledged, safe-to-ignore Supabase/PostGIS finding.
--  - extension_in_public (postgis, pg_net): moving extensions out of
--    `public` risks breaking every unqualified reference across the
--    ~20 functions that use PostGIS/pg_net types — not attempted
--    without a dedicated test pass.
--  - auth_leaked_password_protection: a project-level Auth setting,
--    toggled in the Supabase dashboard (Authentication > Policies >
--    Password Security), not something a SQL migration can reach.
-- ============================================================

-- ── 1. resolve_admin_email rate limiting ──────────────────────

create table if not exists public.admin_login_resolve_attempts (
  login_id        text primary key,
  fail_count      integer not null default 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz not null default now()
);

alter table public.admin_login_resolve_attempts enable row level security;
revoke all on table public.admin_login_resolve_attempts from public, anon, authenticated;

create or replace function public.resolve_admin_email(p_login_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_login_id, '')));
  v_attempt public.admin_login_resolve_attempts%rowtype;
  v_email text;
  v_next_fail_count integer;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
begin
  if v_key = '' then
    return null;
  end if;

  select * into v_attempt
  from public.admin_login_resolve_attempts
  where login_id = v_key
  for update;

  -- Behaves identically to "no such admin" while locked — no distinct
  -- signal an attacker could use to tell "wrong guess" from "locked out".
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return null;
  end if;

  select au.email into v_email
  from public.users u
  join auth.users au on au.id::text = u.id
  where u.admin_login_id = v_key
    and u.roles @> array['admin']
  limit 1;

  if v_email is not null then
    delete from public.admin_login_resolve_attempts where login_id = v_key;
    return v_email;
  end if;

  v_next_fail_count := case
    when v_attempt.login_id is null
      or v_attempt.last_attempt_at <= now() - v_window
      or v_attempt.locked_until is not null
    then 1
    else v_attempt.fail_count + 1
  end;

  insert into public.admin_login_resolve_attempts (login_id, fail_count, last_attempt_at, locked_until)
  values (
    v_key, v_next_fail_count, now(),
    case when v_next_fail_count >= v_max_attempts then now() + v_window else null end
  )
  on conflict (login_id) do update
  set fail_count = excluded.fail_count,
      last_attempt_at = excluded.last_attempt_at,
      locked_until = excluded.locked_until;

  return null;
end
$$;

-- ── 2. Pin search_path on flagged functions (search-path hijack hardening) ──

alter function public.businesses_nearby(double precision, double precision, double precision, text, integer, integer) set search_path = public;
alter function public.providers_nearby(double precision, double precision, double precision, text, integer, integer) set search_path = public;
alter function public.community_posts_nearby(double precision, double precision, double precision, integer, integer) set search_path = public;
alter function public.get_leaderboard() set search_path = public;
alter function public.haversine_km(double precision, double precision, double precision, double precision) set search_path = public;
alter function public.distance_km(double precision, double precision, double precision, double precision) set search_path = public;
alter function public.claim_first_admin(text) set search_path = public;
alter function public.set_admin_login_id(text) set search_path = public;
alter function public.bump_provider_views(text) set search_path = public;
alter function public.increment_stamp(text, text) set search_path = public;

-- ── 3. Storage: drop broad public-listing policies ──────────────

drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Public read app-updates" on storage.objects;
