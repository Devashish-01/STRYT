-- ============================================================
-- 20260828 — Profile-switch PIN
--
-- Lets an account owner set a single PIN that gates switching from customer
-- context into any of their own business/provider hats (never gates
-- switching back to customer — see src/store.tsx's attemptSwitchContext).
-- Device-independent by design: the hash lives on the user row, not in
-- localStorage, so it holds regardless of which device/browser they switch
-- from. Rate-limited with the same per-identifier attempts-table pattern as
-- resolve_admin_email (20260827_security_advisor_hardening.sql) and
-- business_login_attempt (20260823_business_login_rate_limit.sql), keyed by
-- auth.uid() instead of a guessable identifier since this is always an
-- account checking its own PIN.
-- ============================================================

alter table public.users add column if not exists switch_pin_hash text;

create table if not exists public.switch_pin_attempts (
  user_id         text primary key references public.users(id) on delete cascade,
  fail_count      integer not null default 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz not null default now()
);

alter table public.switch_pin_attempts enable row level security;
revoke all on table public.switch_pin_attempts from public, anon, authenticated;

create or replace function public.is_switch_pin_set()
returns boolean
language sql
security definer
set search_path = public
as $$
  select (switch_pin_hash is not null) from public.users where id = auth.uid()::text;
$$;

create or replace function public.set_switch_pin(p_new_pin text, p_current_pin text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_existing_hash text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_new_pin !~ '^\d{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  select switch_pin_hash into v_existing_hash from public.users where id = v_uid;

  -- Routed through verify_switch_pin (not a second direct crypt() check) so
  -- changing/clearing a PIN shares the exact same rate limit as the switch
  -- gate itself — otherwise someone holding a hijacked session could brute
  -- force the PIN through this function instead, since verify_switch_pin's
  -- lockout wouldn't apply to a separate, unguarded comparison here.
  if v_existing_hash is not null then
    if not public.verify_switch_pin(coalesce(p_current_pin, '')) then
      raise exception 'Current PIN is incorrect';
    end if;
  end if;

  update public.users set switch_pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = v_uid;
  delete from public.switch_pin_attempts where user_id = v_uid;
end
$$;

create or replace function public.clear_switch_pin(p_current_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_existing_hash text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select switch_pin_hash into v_existing_hash from public.users where id = v_uid;
  if v_existing_hash is null then return; end if;
  -- Same reasoning as set_switch_pin: reuse verify_switch_pin's rate limit
  -- rather than a second unguarded crypt() comparison.
  if not public.verify_switch_pin(coalesce(p_current_pin, '')) then
    raise exception 'Current PIN is incorrect';
  end if;
  update public.users set switch_pin_hash = null where id = v_uid;
  delete from public.switch_pin_attempts where user_id = v_uid;
end
$$;

create or replace function public.verify_switch_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_hash text;
  v_attempt public.switch_pin_attempts%rowtype;
  v_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if v_uid is null then return false; end if;

  select * into v_attempt from public.switch_pin_attempts where user_id = v_uid for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return false;
  end if;

  select switch_pin_hash into v_hash from public.users where id = v_uid;

  -- Always run one bcrypt comparison, even with no PIN set, so response
  -- timing can't reveal whether a PIN exists.
  v_matches := crypt(coalesce(p_pin, ''), coalesce(v_hash, v_dummy_hash)) = coalesce(v_hash, v_dummy_hash);

  if v_hash is not null and v_matches then
    delete from public.switch_pin_attempts where user_id = v_uid;
    return true;
  end if;

  insert into public.switch_pin_attempts (user_id, fail_count, last_attempt_at, locked_until)
  values (v_uid, 1, now(), null)
  on conflict (user_id) do update
  set fail_count = case
        when switch_pin_attempts.last_attempt_at <= now() - v_window
          or switch_pin_attempts.locked_until is not null
        then 1 else switch_pin_attempts.fail_count + 1 end,
      last_attempt_at = now(),
      locked_until = case
        when (case
          when switch_pin_attempts.last_attempt_at <= now() - v_window
            or switch_pin_attempts.locked_until is not null
          then 1 else switch_pin_attempts.fail_count + 1 end) >= v_max_attempts
        then now() + v_window else null end;

  return false;
end
$$;

revoke execute on function public.is_switch_pin_set() from public, anon;
grant execute on function public.is_switch_pin_set() to authenticated;

revoke execute on function public.set_switch_pin(text, text) from public, anon;
grant execute on function public.set_switch_pin(text, text) to authenticated;

revoke execute on function public.clear_switch_pin(text) from public, anon;
grant execute on function public.clear_switch_pin(text) to authenticated;

revoke execute on function public.verify_switch_pin(text) from public, anon;
grant execute on function public.verify_switch_pin(text) to authenticated;
