-- ============================================================
-- 20260850 — Business & Provider passwords (replaces Switch PIN)
--
-- Splits the single account-wide "switch PIN" (20260828_switch_pin.sql) into
-- two independent, owner-set secrets — one for Business, one for Provider —
-- and, unlike the PIN it replaces, makes each ALSO the gate a delegate must
-- pass to open that owner's business. Today's verify_switch_pin only ever
-- checks the SWITCHING account's own PIN, so a delegate with an active grant
-- never has to pass the owner's secret at all; verify_business_password
-- below resolves the business's owner server-side and checks against THEIR
-- hash regardless of who (owner or delegate) is asking.
--
-- Additive: the old switch_pin_hash column, switch_pin_attempts table, and
-- *_switch_pin() functions are left in place, unused — safe rollback path,
-- no destructive changes to a live production DB. Existing switch-PIN users
-- are backfilled so their protection doesn't silently disappear.
--
-- Providers have no delegation system (see ProviderAccessGuard.tsx), so the
-- provider password only ever gates the owner's own switch-in — no batched
-- delegate lookup is needed for providers, unlike business.
-- ============================================================

alter table public.users add column if not exists business_password_hash text;
alter table public.users add column if not exists provider_password_hash text;

-- Backfill: anyone with a switch PIN today gets it copied to both new slots.
update public.users
   set business_password_hash = coalesce(business_password_hash, switch_pin_hash),
       provider_password_hash = coalesce(provider_password_hash, switch_pin_hash)
 where switch_pin_hash is not null;

-- ── Rate limiting, keyed by the OWNER being checked (not the caller) ────────
-- so the lockout protects the owner's secret regardless of who's guessing —
-- the owner themselves, or any delegate with an active grant.
create table if not exists public.entity_password_attempts (
  owner_user_id   text not null references public.users(id) on delete cascade,
  kind            text not null check (kind in ('business','provider')),
  fail_count      integer not null default 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz not null default now(),
  primary key (owner_user_id, kind)
);
alter table public.entity_password_attempts enable row level security;
revoke all on table public.entity_password_attempts from public, anon, authenticated;

-- ── Self-check: does auth.uid() have a password of this kind set? ──────────
create or replace function public.is_entity_password_set(p_kind text)
returns boolean
language sql security definer stable set search_path = public
as $$
  select case p_kind
    when 'business' then (business_password_hash is not null)
    when 'provider' then (provider_password_hash is not null)
    else false end
  from public.users where id = auth.uid()::text;
$$;
revoke execute on function public.is_entity_password_set(text) from public, anon;
grant execute on function public.is_entity_password_set(text) to authenticated;

-- ── Core verify, rate-limited per (owner, kind). p_owner_user_id is the
--    account whose password is being checked — resolved by the callers below
--    from a business/provider id (or passed as auth.uid() for a self-check
--    from set/clear). Not exposed directly to the client. ──────────────────
create or replace function public._verify_entity_password(p_kind text, p_owner_user_id text, p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  v_attempt public.entity_password_attempts%rowtype;
  v_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if p_owner_user_id is null or p_kind not in ('business','provider') then return false; end if;

  select * into v_attempt from public.entity_password_attempts
   where owner_user_id = p_owner_user_id and kind = p_kind for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return false;
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_hash from public.users where id = p_owner_user_id;

  -- Always run one bcrypt comparison, even with no password set, so response
  -- timing can't reveal whether one exists (same trick as verify_switch_pin).
  v_matches := crypt(coalesce(p_password, ''), coalesce(v_hash, v_dummy_hash)) = coalesce(v_hash, v_dummy_hash);

  if v_hash is not null and v_matches then
    delete from public.entity_password_attempts where owner_user_id = p_owner_user_id and kind = p_kind;
    return true;
  end if;

  insert into public.entity_password_attempts (owner_user_id, kind, fail_count, last_attempt_at, locked_until)
  values (p_owner_user_id, p_kind, 1, now(), null)
  on conflict (owner_user_id, kind) do update
  set fail_count = case
        when entity_password_attempts.last_attempt_at <= now() - v_window
          or entity_password_attempts.locked_until is not null
        then 1 else entity_password_attempts.fail_count + 1 end,
      last_attempt_at = now(),
      locked_until = case
        when (case
          when entity_password_attempts.last_attempt_at <= now() - v_window
            or entity_password_attempts.locked_until is not null
          then 1 else entity_password_attempts.fail_count + 1 end) >= v_max_attempts
        then now() + v_window else null end;

  return false;
end $$;
revoke execute on function public._verify_entity_password(text, text, text) from public, anon, authenticated;

-- ── Public verify entrypoints. A real entity id resolves to ITS owner (so a
--    delegate is checked against the owner's password, never their own);
--    NULL means "check my own" (used by set/clear to confirm the current
--    password before changing/removing it). ─────────────────────────────────
create or replace function public.verify_business_password(p_business_id text, p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare v_owner text;
begin
  if p_business_id is null then
    v_owner := auth.uid()::text;
  else
    select owner_user_id into v_owner from public.businesses where id = p_business_id;
  end if;
  return public._verify_entity_password('business', v_owner, p_password);
end $$;
revoke execute on function public.verify_business_password(text, text) from public, anon;
grant execute on function public.verify_business_password(text, text) to authenticated;

create or replace function public.verify_provider_password(p_provider_id text, p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare v_owner text;
begin
  if p_provider_id is null then
    v_owner := auth.uid()::text;
  else
    select user_id into v_owner from public.providers where id = p_provider_id;
  end if;
  return public._verify_entity_password('provider', v_owner, p_password);
end $$;
revoke execute on function public.verify_provider_password(text, text) from public, anon;
grant execute on function public.verify_provider_password(text, text) to authenticated;

-- ── Set / clear — self only, the owner manages their own passwords. ────────
create or replace function public.set_entity_password(p_kind text, p_new_password text, p_current_password text default null)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business','provider') then raise exception 'Invalid kind'; end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing from public.users where id = v_uid;

  -- Reuses _verify_entity_password (not a second unguarded comparison) so
  -- changing a password shares the exact same rate limit as the switch gate
  -- itself — otherwise a hijacked session could brute force it here instead.
  if v_existing is not null then
    if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
      raise exception 'Current password is incorrect';
    end if;
  end if;

  if p_kind = 'business' then
    update public.users set business_password_hash = crypt(p_new_password, gen_salt('bf')) where id = v_uid;
  else
    update public.users set provider_password_hash = crypt(p_new_password, gen_salt('bf')) where id = v_uid;
  end if;
  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
end $$;
revoke execute on function public.set_entity_password(text, text, text) from public, anon;
grant execute on function public.set_entity_password(text, text, text) to authenticated;

create or replace function public.clear_entity_password(p_kind text, p_current_password text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business','provider') then raise exception 'Invalid kind'; end if;
  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing from public.users where id = v_uid;
  if v_existing is null then return; end if;
  if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
    raise exception 'Current password is incorrect';
  end if;
  if p_kind = 'business' then
    update public.users set business_password_hash = null where id = v_uid;
  else
    update public.users set provider_password_hash = null where id = v_uid;
  end if;
  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
end $$;
revoke execute on function public.clear_entity_password(text, text) from public, anon;
grant execute on function public.clear_entity_password(text, text) to authenticated;

-- ── Delegate-side lookup: for each of MY active delegated businesses, does
--    ITS owner have a business password set? Batched (one round trip, not
--    one RPC call per business) so the client can populate its switch-gate
--    map without an N+1. ─────────────────────────────────────────────────────
create or replace function public.my_delegated_business_password_status()
returns table (business_id text, required boolean)
language sql security definer stable set search_path = public
as $$
  select s.business_id, (u.business_password_hash is not null) as required
    from public.business_access_sessions s
    join public.businesses b on b.id = s.business_id
    join public.users u on u.id = b.owner_user_id
   where s.grantee_user_id = auth.uid()::text
     and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
     and b.owner_user_id <> auth.uid()::text;
$$;
revoke execute on function public.my_delegated_business_password_status() from public, anon;
grant execute on function public.my_delegated_business_password_status() to authenticated;
