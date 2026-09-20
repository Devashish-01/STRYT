-- Rollback for 20260997_onboarding_requires_phone
--
-- Restores `customer_onboarding` to its 20260993 definition: the 'identity' step stops requiring a
-- phone number and stops writing one. Taken from the live catalogue before 20260997 was applied, not
-- from memory.
--
-- Roll the client back too, or BeatIdentity will keep collecting a number the server then ignores —
-- the field would still be required on screen while doing nothing, which is worse than either state on
-- its own.
--
-- Phone numbers already collected are NOT removed: they are ordinary profile data that people entered
-- deliberately, and deleting them because a validation rule was reverted would be the wrong call to
-- make automatically. Remove them explicitly if that is genuinely what is wanted.

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
  v_interests text[];
  v_lat double precision;
  v_lng double precision;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  insert into public.users(id, name, email, phone, roles)
    select id::text, 'New user', email, phone, array['customer']::text[]
    from auth.users where id = auth.uid()
    on conflict (id) do nothing;
  select * into v_user from public.users where id = v_uid for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  insert into public.customer_onboarding_state(user_id) values(v_uid) on conflict do nothing;
  select * into v_state from public.customer_onboarding_state where user_id = v_uid;

  if p_action = 'read' then
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
$function$;

notify pgrst, 'reload schema';

commit;
