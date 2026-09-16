-- 20260983_entity_password_lockout_per_attempter
--
-- SECURITY_SETTINGS SEC-2: the console password's rate limit was counted per (owner, kind), so five wrong guesses by
-- anyone locked the *owner* out of their own shop for fifteen minutes — a delegated team member fumbling their entry,
-- or a stranger doing it on purpose, since verify_business_password/verify_provider_password accepted a call from any
-- signed-in user. Failures are now counted per person attempting, and only the owner or someone with an active access
-- grant may attempt at all; anyone else is refused without touching a counter.
--
-- SECURITY_SETTINGS SEC-4: the lockout was a flat fifteen minutes that reset afterwards, so guessing could continue
-- indefinitely at 5 tries per window. Each further lockout of the same person now doubles, up to a day, and a separate
-- entity-wide brake stops a crowd of accounts guessing the same password in parallel — while never blocking the owner.
--
-- Rollback: supabase/rollbacks/20260983_entity_password_lockout_per_attempter.rollback.sql

alter table public.entity_password_attempts
  add column if not exists attempted_by text not null default '',
  add column if not exists lockout_count integer not null default 0;

alter table public.entity_password_attempts drop constraint if exists entity_password_attempts_pkey;
alter table public.entity_password_attempts
  add constraint entity_password_attempts_pkey primary key (owner_user_id, kind, attempted_by);

create index if not exists entity_password_attempts_window_idx
  on public.entity_password_attempts (owner_user_id, kind, last_attempt_at desc);

create or replace function public._verify_entity_password(p_kind text, p_owner_user_id text, p_password text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_hash text;
  v_attempt public.entity_password_attempts%rowtype;
  v_matches boolean;
  v_actor text := coalesce(auth.uid()::text, '');
  v_fails integer;
  v_lockouts integer;
  v_max_attempts constant integer := 5;
  v_entity_max constant integer := 20;
  v_window constant interval := interval '15 minutes';
  v_max_lock constant interval := interval '24 hours';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if p_owner_user_id is null or p_kind not in ('business','provider') then return false; end if;

  -- Per person attempting, so one member's mistakes can't lock anyone else out (SEC-2).
  select * into v_attempt from public.entity_password_attempts
   where owner_user_id = p_owner_user_id and kind = p_kind and attempted_by = v_actor for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return false;
  end if;

  -- Entity-wide brake: many accounts guessing the same password in parallel. Never applies to the owner, who can
  -- always reach their own shop (SEC-2/SEC-4).
  if v_actor is distinct from p_owner_user_id then
    select coalesce(sum(fail_count), 0) into v_fails
      from public.entity_password_attempts
     where owner_user_id = p_owner_user_id and kind = p_kind and last_attempt_at > now() - v_window;
    if v_fails >= v_entity_max then
      return false;
    end if;
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_hash from public.users where id = p_owner_user_id;

  -- Always run one bcrypt comparison, even with no password set, so response
  -- timing can't reveal whether one exists (same trick as verify_switch_pin).
  v_matches := crypt(coalesce(p_password, ''), coalesce(v_hash, v_dummy_hash)) = coalesce(v_hash, v_dummy_hash);

  if v_hash is not null and v_matches then
    delete from public.entity_password_attempts
     where owner_user_id = p_owner_user_id and kind = p_kind and attempted_by = v_actor;
    return true;
  end if;

  -- A fresh window (or the end of a lockout) starts the count again, but the number of lockouts this person has
  -- collected persists, so each one lasts twice as long as the last, up to a day (SEC-4).
  v_lockouts := coalesce(v_attempt.lockout_count, 0);
  insert into public.entity_password_attempts (owner_user_id, kind, attempted_by, fail_count, last_attempt_at, locked_until, lockout_count)
  values (p_owner_user_id, p_kind, v_actor, 1, now(), null, 0)
  on conflict (owner_user_id, kind, attempted_by) do update
  set fail_count = case
        when entity_password_attempts.last_attempt_at <= now() - v_window
          or entity_password_attempts.locked_until is not null
        then 1 else entity_password_attempts.fail_count + 1 end,
      last_attempt_at = now(),
      lockout_count = case
        when (case
          when entity_password_attempts.last_attempt_at <= now() - v_window
            or entity_password_attempts.locked_until is not null
          then 1 else entity_password_attempts.fail_count + 1 end) >= v_max_attempts
        then v_lockouts + 1 else entity_password_attempts.lockout_count end,
      locked_until = case
        when (case
          when entity_password_attempts.last_attempt_at <= now() - v_window
            or entity_password_attempts.locked_until is not null
          then 1 else entity_password_attempts.fail_count + 1 end) >= v_max_attempts
        then now() + least(v_window * power(2, v_lockouts)::integer, v_max_lock)
        else null end;

  return false;
end $function$;

create or replace function public.verify_business_password(p_business_id text, p_password text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_owner text;
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then return false; end if;
  if p_business_id is null then
    v_owner := v_uid;
  else
    select owner_user_id into v_owner from public.businesses where id = p_business_id;
    -- Only the owner or someone they granted access to may even try, so a stranger can neither guess the password nor
    -- burn the owner's attempts (SEC-2).
    if v_owner is distinct from v_uid
       and not exists (select 1 from public.business_access_sessions s
                        where s.business_id = p_business_id and s.grantee_user_id = v_uid
                          and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())) then
      return false;
    end if;
  end if;
  return public._verify_entity_password('business', v_owner, p_password);
end $function$;

create or replace function public.verify_provider_password(p_provider_id text, p_password text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_owner text;
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then return false; end if;
  if p_provider_id is null then
    v_owner := v_uid;
  else
    select user_id into v_owner from public.providers where id = p_provider_id;
    -- A provider profile has no delegated access, so only its owner may try (SEC-2).
    if v_owner is distinct from v_uid then return false; end if;
  end if;
  return public._verify_entity_password('provider', v_owner, p_password);
end $function$;
