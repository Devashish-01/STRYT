-- ============================================================
-- 20260856 — Business & Provider password recovery (backup Q&A)
--
-- APPLIED TO PRODUCTION 2026-07-27 as `entity_password_recovery_a_schema_helpers`
-- + `entity_password_recovery_b_rpcs`.
--
-- ⚠️ HISTORY: this file was committed (as 20260851) but NOT applied, while the
-- client already depended on it. PinEntrySheet's first-time setup path defers
-- the password write entirely to setup_entity_password_with_recovery(), so
-- until this was applied **no owner could set a business or provider password
-- at all** — the RPC 404'd and the password was never written. Renumbered from
-- 20260851 (which collided with 20260851_home_delivery_toggle_and_eta.sql) to
-- reflect true apply order. See docs: a migration file is not proof it ran.
--
-- Adds optional backup reset questions alongside the entity passwords
-- introduced in 20260850_entity_passwords.sql. Answers are normalized
-- (trim + lower) and stored as bcrypt hashes — never plaintext.
--
-- Public RPCs (authenticated only):
--   is_entity_recovery_set(kind)
--   get_entity_recovery_question(kind)
--   setup_entity_password_with_recovery(...)   — atomic first-time setup
--   set_entity_recovery(...)                   — update Q&A (password required)
--   reset_entity_password_via_recovery(...)    — owner-only forgot flow
--
-- clear_entity_password is replaced so removing a password also clears recovery.
-- ============================================================

alter table public.users add column if not exists business_recovery_question_id text;
alter table public.users add column if not exists business_recovery_question_text text;
alter table public.users add column if not exists business_recovery_answer_hash text;

alter table public.users add column if not exists provider_recovery_question_id text;
alter table public.users add column if not exists provider_recovery_question_text text;
alter table public.users add column if not exists provider_recovery_answer_hash text;

-- ── Rate limiting for recovery-answer guesses (separate from password verify) ─
create table if not exists public.entity_recovery_attempts (
  owner_user_id   text not null references public.users(id) on delete cascade,
  kind            text not null check (kind in ('business', 'provider')),
  fail_count      integer not null default 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz not null default now(),
  primary key (owner_user_id, kind)
);

alter table public.entity_recovery_attempts enable row level security;
revoke all on table public.entity_recovery_attempts from public, anon, authenticated;

-- ── Helpers (not exposed to clients) ────────────────────────────────────────

create or replace function public._normalize_recovery_answer(p_answer text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_answer, '')));
$$;

revoke execute on function public._normalize_recovery_answer(text) from public, anon, authenticated;

create or replace function public._validate_recovery_question(p_kind text, p_question_id text, p_question_text text)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_allowed text[];
begin
  if p_kind not in ('business', 'provider') then
    raise exception 'Invalid kind';
  end if;

  v_allowed := case p_kind
    when 'business' then array['first_shop', 'business_city', 'phone_last4', 'year_started', 'custom']
    else array['first_service', 'work_city', 'upi_last4', 'custom']
  end;

  if p_question_id is null or not (p_question_id = any (v_allowed)) then
    raise exception 'Invalid recovery question';
  end if;

  if p_question_id = 'custom' then
    if length(trim(coalesce(p_question_text, ''))) < 3 then
      raise exception 'Custom question must be at least 3 characters';
    end if;
    if length(trim(p_question_text)) > 120 then
      raise exception 'Custom question must be at most 120 characters';
    end if;
  elsif p_question_text is not null and length(trim(p_question_text)) > 0 then
  -- Preset ids must not carry custom text (ignore stray text rather than fail).
    null;
  end if;
end;
$$;

revoke execute on function public._validate_recovery_question(text, text, text) from public, anon, authenticated;

create or replace function public._verify_entity_recovery_answer(
  p_kind text,
  p_owner_user_id text,
  p_answer text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_attempt public.entity_recovery_attempts%rowtype;
  v_normalized text;
  v_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if p_owner_user_id is null or p_kind not in ('business', 'provider') then
    return false;
  end if;

  select * into v_attempt
    from public.entity_recovery_attempts
   where owner_user_id = p_owner_user_id and kind = p_kind
   for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return false;
  end if;

  select case p_kind
           when 'business' then business_recovery_answer_hash
           else provider_recovery_answer_hash
         end
    into v_hash
    from public.users
   where id = p_owner_user_id;

  v_normalized := public._normalize_recovery_answer(p_answer);

  -- Always run one bcrypt comparison, even with no recovery set.
  v_matches := crypt(
    coalesce(v_normalized, ''),
    coalesce(v_hash, v_dummy_hash)
  ) = coalesce(v_hash, v_dummy_hash);

  if v_hash is not null and v_matches then
    delete from public.entity_recovery_attempts
     where owner_user_id = p_owner_user_id and kind = p_kind;
    return true;
  end if;

  insert into public.entity_recovery_attempts (owner_user_id, kind, fail_count, last_attempt_at, locked_until)
  values (p_owner_user_id, p_kind, 1, now(), null)
  on conflict (owner_user_id, kind) do update
  set fail_count = case
        when entity_recovery_attempts.last_attempt_at <= now() - v_window
          or entity_recovery_attempts.locked_until is not null
        then 1
        else entity_recovery_attempts.fail_count + 1
      end,
      last_attempt_at = now(),
      locked_until = case
        when (case
          when entity_recovery_attempts.last_attempt_at <= now() - v_window
            or entity_recovery_attempts.locked_until is not null
          then 1
          else entity_recovery_attempts.fail_count + 1
        end) >= v_max_attempts
        then now() + v_window
        else null
      end;

  return false;
end;
$$;

revoke execute on function public._verify_entity_recovery_answer(text, text, text) from public, anon, authenticated;

-- ── is_entity_recovery_set ──────────────────────────────────────────────────

create or replace function public.is_entity_recovery_set(p_kind text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case p_kind
    when 'business' then (business_recovery_answer_hash is not null)
    when 'provider' then (provider_recovery_answer_hash is not null)
    else false
  end
  from public.users
  where id = auth.uid()::text;
$$;

revoke execute on function public.is_entity_recovery_set(text) from public, anon;
grant execute on function public.is_entity_recovery_set(text) to authenticated;

-- ── get_entity_recovery_question — owner reads their own prompt ───────────────

create or replace function public.get_entity_recovery_question(p_kind text)
returns table (question_id text, question_text text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_qid text;
  v_qtext text;
begin
  if v_uid is null then
    return;
  end if;
  if p_kind not in ('business', 'provider') then
    return;
  end if;

  if p_kind = 'business' then
    select business_recovery_question_id, business_recovery_question_text
      into v_qid, v_qtext
      from public.users
     where id = v_uid
       and business_recovery_answer_hash is not null;
  else
    select provider_recovery_question_id, provider_recovery_question_text
      into v_qid, v_qtext
      from public.users
     where id = v_uid
       and provider_recovery_answer_hash is not null;
  end if;

  if v_qid is null then
    return;
  end if;

  question_id := v_qid;
  question_text := case when v_qid = 'custom' then v_qtext else null end;
  return next;
end;
$$;

revoke execute on function public.get_entity_recovery_question(text) from public, anon;
grant execute on function public.get_entity_recovery_question(text) to authenticated;

-- ── setup_entity_password_with_recovery — first-time atomic setup ─────────────

create or replace function public.setup_entity_password_with_recovery(
  p_kind text,
  p_new_password text,
  p_question_id text,
  p_question_text text default null,
  p_answer text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
  v_normalized text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  perform public._validate_recovery_question(p_kind, p_question_id, p_question_text);

  v_normalized := public._normalize_recovery_answer(p_answer);
  if length(v_normalized) < 3 then
    raise exception 'Answer must be at least 3 characters';
  end if;
  if length(v_normalized) > 80 then
    raise exception 'Answer must be at most 80 characters';
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing
    from public.users
   where id = v_uid;

  if v_existing is not null then
    raise exception 'Password already set — use set_entity_password and set_entity_recovery instead';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_password_hash = crypt(p_new_password, gen_salt('bf')),
           business_recovery_question_id = p_question_id,
           business_recovery_question_text = case when p_question_id = 'custom' then trim(p_question_text) else null end,
           business_recovery_answer_hash = crypt(v_normalized, gen_salt('bf'))
     where id = v_uid;
  else
    update public.users
       set provider_password_hash = crypt(p_new_password, gen_salt('bf')),
           provider_recovery_question_id = p_question_id,
           provider_recovery_question_text = case when p_question_id = 'custom' then trim(p_question_text) else null end,
           provider_recovery_answer_hash = crypt(v_normalized, gen_salt('bf'))
     where id = v_uid;
  end if;

  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
  delete from public.entity_recovery_attempts where owner_user_id = v_uid and kind = p_kind;
end;
$$;

revoke execute on function public.setup_entity_password_with_recovery(text, text, text, text, text) from public, anon;
grant execute on function public.setup_entity_password_with_recovery(text, text, text, text, text) to authenticated;

-- ── set_entity_recovery — update Q&A (requires current password) ──────────────

create or replace function public.set_entity_recovery(
  p_kind text,
  p_question_id text,
  p_question_text text default null,
  p_answer text default null,
  p_current_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_password_hash text;
  v_normalized text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;

  perform public._validate_recovery_question(p_kind, p_question_id, p_question_text);

  v_normalized := public._normalize_recovery_answer(p_answer);
  if length(v_normalized) < 3 then
    raise exception 'Answer must be at least 3 characters';
  end if;
  if length(v_normalized) > 80 then
    raise exception 'Answer must be at most 80 characters';
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_password_hash
    from public.users
   where id = v_uid;

  if v_password_hash is null then
    raise exception 'Set a password first';
  end if;

  if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
    raise exception 'Current password is incorrect';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_recovery_question_id = p_question_id,
           business_recovery_question_text = case when p_question_id = 'custom' then trim(p_question_text) else null end,
           business_recovery_answer_hash = crypt(v_normalized, gen_salt('bf'))
     where id = v_uid;
  else
    update public.users
       set provider_recovery_question_id = p_question_id,
           provider_recovery_question_text = case when p_question_id = 'custom' then trim(p_question_text) else null end,
           provider_recovery_answer_hash = crypt(v_normalized, gen_salt('bf'))
     where id = v_uid;
  end if;

  delete from public.entity_recovery_attempts where owner_user_id = v_uid and kind = p_kind;
end;
$$;

revoke execute on function public.set_entity_recovery(text, text, text, text, text) from public, anon;
grant execute on function public.set_entity_recovery(text, text, text, text, text) to authenticated;

-- ── reset_entity_password_via_recovery — owner-only forgot flow ───────────────

create or replace function public.reset_entity_password_via_recovery(
  p_kind text,
  p_answer text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_recovery_hash text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select case p_kind
           when 'business' then business_recovery_answer_hash
           else provider_recovery_answer_hash
         end
    into v_recovery_hash
    from public.users
   where id = v_uid;

  if v_recovery_hash is null then
    raise exception 'No recovery question is set';
  end if;

  if not public._verify_entity_recovery_answer(p_kind, v_uid, p_answer) then
    raise exception 'Recovery answer is incorrect';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_password_hash = crypt(p_new_password, gen_salt('bf'))
     where id = v_uid;
  else
    update public.users
       set provider_password_hash = crypt(p_new_password, gen_salt('bf'))
     where id = v_uid;
  end if;

  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
end;
$$;

revoke execute on function public.reset_entity_password_via_recovery(text, text, text) from public, anon;
grant execute on function public.reset_entity_password_via_recovery(text, text, text) to authenticated;

-- ── clear_entity_password — also clears recovery (replace 20260850 version) ───

create or replace function public.clear_entity_password(p_kind text, p_current_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing
    from public.users
   where id = v_uid;

  if v_existing is null then return; end if;

  if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
    raise exception 'Current password is incorrect';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_password_hash = null,
           business_recovery_question_id = null,
           business_recovery_question_text = null,
           business_recovery_answer_hash = null
     where id = v_uid;
  else
    update public.users
       set provider_password_hash = null,
           provider_recovery_question_id = null,
           provider_recovery_question_text = null,
           provider_recovery_answer_hash = null
     where id = v_uid;
  end if;

  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
  delete from public.entity_recovery_attempts where owner_user_id = v_uid and kind = p_kind;
end;
$$;

revoke execute on function public.clear_entity_password(text, text) from public, anon;
grant execute on function public.clear_entity_password(text, text) to authenticated;
