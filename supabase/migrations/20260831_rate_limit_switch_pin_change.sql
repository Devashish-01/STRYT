-- ============================================================
-- 20260831 — Rate-limit set_switch_pin / clear_switch_pin too
--
-- Caught during live functional verification: set_switch_pin and
-- clear_switch_pin each did their own direct crypt() comparison against the
-- caller-supplied current PIN, completely unguarded by switch_pin_attempts —
-- only verify_switch_pin (the actual switch gate) was rate-limited. Someone
-- holding a hijacked/unlocked session could have brute-forced the PIN
-- through these two functions instead, bypassing the lockout entirely.
-- Fixed by routing both through verify_switch_pin itself rather than a
-- second, separately-unguarded comparison — one rate limit, shared.
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
  if not public.verify_switch_pin(coalesce(p_current_pin, '')) then
    raise exception 'Current PIN is incorrect';
  end if;
  update public.users set switch_pin_hash = null where id = v_uid;
  delete from public.switch_pin_attempts where user_id = v_uid;
end
$$;
