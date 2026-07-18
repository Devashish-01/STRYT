-- ============================================================
-- 20260830 — Fix search_path on switch-PIN functions
--
-- Caught by live functional verification immediately after applying
-- 20260828_switch_pin.sql: set_switch_pin/clear_switch_pin/verify_switch_pin
-- were pinned to `search_path = public` only, but pgcrypto (crypt/gen_salt)
-- lives in the `extensions` schema on this project, not `public` — every
-- call failed with "function gen_salt(unknown) does not exist". Matches the
-- existing business_login_attempt convention (search_path = public,
-- extensions). is_switch_pin_set doesn't touch pgcrypto, unaffected.
-- ============================================================

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

  if v_existing_hash is not null then
    if p_current_pin is null or crypt(p_current_pin, v_existing_hash) <> v_existing_hash then
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
  if p_current_pin is null or crypt(p_current_pin, v_existing_hash) <> v_existing_hash then
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
