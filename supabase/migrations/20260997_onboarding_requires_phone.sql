-- 20260997_onboarding_requires_phone
--
-- Onboarding now collects a phone number, and the server has to be the thing that requires it. The
-- client's check is a courtesy to the person typing; `customer_onboarding` is reachable directly over
-- /rest/v1/rpc with nothing but the publishable key, so a rule that lives only in React is not a rule.
--
-- What changes: the 'identity' action additionally requires a plausible Indian mobile number and writes
-- it to users.phone. Everything else in the function is byte-identical to the live definition read from
-- pg_get_functiondef on 2026-09-20 (HANDOFF rule 4).
--
-- NOT verified, deliberately. There is no OTP behind this number: verifying every signup would mean an
-- SMS per account, keeping Supabase's phone auth provider enabled, and promoting CAPTCHA and rate
-- limiting from pending work to prerequisites. The number is contact information, not proof of
-- identity, and nothing may treat it as proof — no "verified" badge, never an auth factor. Owner's
-- decision, 2026-09-20.
--
-- Existing accounts are untouched, also by decision. 32 production users finished onboarding before this
-- existed and have no phone; the gate is on the 'identity' step, which a completed account never runs
-- again (the function returns early at step 4). Nobody gets locked out of an app they already use.
--
-- The regex mirrors isValidPhone() in src/lib/phone.ts: +91 followed by 6-9 and nine digits. Indian
-- mobile numbers start 6-9; landlines and service codes do not, and an unreachable number is worse than
-- none in a marketplace where two people have to actually meet.
--
-- Rollback: supabase/rollbacks/20260997_onboarding_requires_phone.rollback.sql

begin;

create or replace function public.customer_onboarding(p_action text default 'read', p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_user public.users%rowtype;
  v_state public.customer_onboarding_state%rowtype;
  v_meta jsonb;
  v_name text;
  v_alias text;
  v_phone text;
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
        -- New in 20260997. Mirrors isValidPhone() in src/lib/phone.ts.
        v_phone := btrim(p_payload->>'phone');
        if v_phone is null or v_phone !~ '^\+91[6-9][0-9]{9}$' then raise exception 'PHONE_REQUIRED'; end if;
        update public.users set name = v_name, avatar = nullif(p_payload->>'avatar', ''), phone = v_phone
          where id = v_uid;
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
        -- alias is checked here as well as at its own step: 'handle' is the only writer, but 'finish'
        -- is what marks the account complete, so it is the last place a missing username can be caught.
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
$function$;

notify pgrst, 'reload schema';

commit;

-- Verify:
--   identity without a phone            -> PHONE_REQUIRED
--   identity with '9876543210'          -> PHONE_REQUIRED (not E.164; the client normalises first)
--   identity with '+915876543210'       -> PHONE_REQUIRED (Indian mobiles start 6-9)
--   identity with '+919876543210'       -> step 1, users.phone written
--   a completed account replaying it    -> step 4, unchanged
