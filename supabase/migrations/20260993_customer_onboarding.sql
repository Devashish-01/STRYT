-- Deploy before the onboarding client. Additive: existing completed accounts stay completed.
--
-- ⚠ ORDER MATTERS: the client in this working tree already calls both RPCs
-- (src/services/core/onboardingService.ts:8 -> customer_onboarding,
--  src/lib/loginAcceptance.ts:51 -> record_login_acceptance) with no fallback. Shipping the app
-- before this migration breaks onboarding for every new signup.
--
-- Verified on staging (laswruzdyqehziyupmdm) 2026-09-20 — applied, exercised end to end with a
-- throwaway auth user, then the user and its rows were deleted (7 personas intact, 0 leftovers):
--   * full happy path read -> identity -> handle -> location -> finish returns steps 0,1,2,3,4 and
--     sets onboarding_completed_at;
--   * 'read' hydrates name and avatar from Google raw_user_meta_data on an untouched profile;
--   * gates hold: identity before terms -> TERMS_REQUIRED, handle before identity -> IDENTITY_REQUIRED,
--     identity without ageConfirmed -> AGE_CONFIRMATION_REQUIRED, unknown action ->
--     INVALID_ONBOARDING_ACTION, lat 999 -> INVALID_LOCATION, unknown category -> INVALID_INTERESTS,
--     alias 'AB' / 'bad alias!' -> INVALID_ALIAS;
--   * record_login_acceptance is replay-safe: the same login_attempt_id twice leaves 1 row (the partial
--     unique index infers correctly), and a wrong version -> INVALID_ACCEPTANCE;
--   * alias is lower-cased on write ('Asha_K99' -> 'asha_k99'); a taken alias raises 23505, which the
--     client already maps to "Already taken" (src/screens/auth/UserOnboard.tsx:36);
--   * a completed account replaying 'identity' is a no-op returning step 4 — the name is not overwritten;
--   * authorization: anon cannot execute either RPC (42501), and a signed-in user reading another
--     user's customer_onboarding_state gets 0 rows.
-- Checked against production's live catalog first: public.users has only id and name NOT NULL without a
-- default (both supplied by the restore INSERT), and users_alias_unique already exists.
-- Staging took this as two ledger rows (…_customer_onboarding + …_part2) purely because it was applied
-- in two calls; production should take this file as ONE migration named 20260993_customer_onboarding.
begin;

alter table public.terms_acceptances add column acceptance_method text;
alter table public.terms_acceptances add column login_attempt_id uuid;
create unique index terms_acceptances_login_attempt_unique
  on public.terms_acceptances(user_id, login_attempt_id) where login_attempt_id is not null;

create table public.customer_onboarding_state (
  user_id text primary key references public.users(id) on delete cascade,
  step smallint not null default 0 check (step between 0 and 4),
  age_confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.customer_onboarding_state enable row level security;
revoke all on public.customer_onboarding_state from public, anon, authenticated;
grant select on public.customer_onboarding_state to authenticated;
create policy onboarding_read_own on public.customer_onboarding_state for select to authenticated
  using (user_id = (select auth.uid())::text);

create function public.record_login_acceptance(p_version text, p_attempt_id uuid, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_attempt_id is null or p_version is distinct from '2026-08-26' then
    raise exception 'INVALID_ACCEPTANCE';
  end if;
  -- Serialize profile updates and keep acceptance plus audit insertion atomic.
  perform 1 from public.users where id = v_uid for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  insert into public.terms_acceptances(user_id, version, user_agent, acceptance_method, login_attempt_id)
    values (v_uid, p_version, left(p_user_agent, 400), 'google_button', p_attempt_id)
    on conflict (user_id, login_attempt_id) where login_attempt_id is not null do nothing;
  update public.users set terms_accepted_version = p_version, terms_accepted_at = now() where id = v_uid;
end;
$$;
revoke all on function public.record_login_acceptance(text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_login_acceptance(text, uuid, text) to authenticated;

create function public.customer_onboarding(p_action text default 'read', p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_user public.users%rowtype;
  v_state public.customer_onboarding_state%rowtype;
  v_meta jsonb;
  v_name text;
  v_alias text;
  v_interests text[];
  v_lat double precision;
  v_lng double precision;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  -- Restore a missing profile without trusting any client-supplied identity.
  insert into public.users(id, name, email, phone, roles)
    select id::text, 'New user', email, phone, array['customer']::text[]
    from auth.users where id = auth.uid()
    on conflict (id) do nothing;
  select * into v_user from public.users where id = v_uid for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  insert into public.customer_onboarding_state(user_id) values(v_uid) on conflict do nothing;
  select * into v_state from public.customer_onboarding_state where user_id = v_uid;

  if p_action = 'read' then
    -- Only hydrate an untouched, incomplete profile. Never overwrite a confirmed name/photo.
    if v_user.onboarding_completed_at is null and v_state.step = 0 then
      select raw_user_meta_data into v_meta from auth.users where id = auth.uid();
      v_name := nullif(btrim(coalesce(v_meta->>'full_name', v_meta->>'name')), '');
      update public.users set
        name = case when (btrim(name) = '' or name = 'New user' or name like '%@%'
          or name ~ '^[+0-9 -]{7,}$') and v_name is not null then left(v_name, 40) else name end,
        avatar = coalesce(nullif(avatar, ''), nullif(v_meta->>'avatar_url', ''), nullif(v_meta->>'picture', ''))
        where id = v_uid;
    end if;
  else
    if v_user.terms_accepted_version is distinct from '2026-08-26' then raise exception 'TERMS_REQUIRED'; end if;
    if v_user.onboarding_completed_at is not null then
      return jsonb_build_object('onboardingStep', 4, 'ageConfirmedAt', v_state.age_confirmed_at);
    end if;
    case p_action
      when 'identity' then
        v_name := btrim(p_payload->>'name');
        if v_name is null or length(v_name) not between 1 and 40 or v_name = 'New user'
          or v_name like '%@%' or v_name ~ '^[+0-9 -]{7,}$' then raise exception 'NAME_REQUIRED'; end if;
        if p_payload->'ageConfirmed' is distinct from 'true'::jsonb then raise exception 'AGE_CONFIRMATION_REQUIRED'; end if;
        update public.users set name = v_name, avatar = nullif(p_payload->>'avatar', '') where id = v_uid;
        update public.customer_onboarding_state set step = greatest(step, 1),
          age_confirmed_at = coalesce(age_confirmed_at, now()) where user_id = v_uid;
      when 'handle' then
        if v_state.step < 1 or v_state.age_confirmed_at is null then raise exception 'IDENTITY_REQUIRED'; end if;
        v_alias := lower(btrim(p_payload->>'alias'));
        if v_alias is null or v_alias !~ '^[a-z0-9_.]{3,20}$' then raise exception 'INVALID_ALIAS'; end if;
        update public.users set alias = v_alias where id = v_uid;
        update public.customer_onboarding_state set step = greatest(step, 2) where user_id = v_uid;
      when 'location' then
        if v_state.step < 2 then raise exception 'HANDLE_REQUIRED'; end if;
        if coalesce((p_payload->>'skip')::boolean, false) is not true then
          v_lat := (p_payload->>'lat')::double precision;
          v_lng := (p_payload->>'lng')::double precision;
          if v_lat is null or v_lng is null or not (v_lat between -90 and 90 and v_lng between -180 and 180)
            then raise exception 'INVALID_LOCATION'; end if;
          update public.users set lat = v_lat, lng = v_lng, area = left(p_payload->>'area', 200) where id = v_uid;
        end if;
        update public.customer_onboarding_state set step = greatest(step, 3) where user_id = v_uid;
      when 'finish' then
        if v_state.step < 3 or v_state.age_confirmed_at is null or v_user.alias is null then
          raise exception 'ONBOARDING_INCOMPLETE';
        end if;
        select coalesce(array_agg(distinct value), '{}'::text[]) into v_interests
          from jsonb_array_elements_text(coalesce(p_payload->'interests', '[]'::jsonb));
        if cardinality(v_interests) > 30 or exists (
          select 1 from unnest(v_interests) as chosen(id) where not exists (
            select 1 from public.categories c where c.id = chosen.id and c.parent_id is null and c.status = 'ACTIVE'
          )
        ) then raise exception 'INVALID_INTERESTS'; end if;
        update public.users set interest_category_ids = v_interests, onboarding_completed_at = now() where id = v_uid;
        update public.customer_onboarding_state set step = 4 where user_id = v_uid;
      else raise exception 'INVALID_ONBOARDING_ACTION';
    end case;
    update public.customer_onboarding_state set updated_at = now() where user_id = v_uid;
  end if;
  select * into v_state from public.customer_onboarding_state where user_id = v_uid;
  return jsonb_build_object('onboardingStep', case when v_user.onboarding_completed_at is not null then 4 else v_state.step end,
    'ageConfirmedAt', v_state.age_confirmed_at);
end;
$$;
revoke all on function public.customer_onboarding(text, jsonb) from public, anon, authenticated;
grant execute on function public.customer_onboarding(text, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
