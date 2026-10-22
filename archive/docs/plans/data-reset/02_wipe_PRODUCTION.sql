-- 02_wipe_PRODUCTION.sql — READY TO RUN on production (gnswxlfmcwyhmzlfipql) in the Supabase SQL Editor.
-- Generated from 02_wipe.sql with the admin id filled in and `commit;` at the end.
-- DESTRUCTIVE and irreversible except from schema wipe_backup_20261018 (already created and verified 2026-10-18:
-- every table's backup row count equals its source).
-- Keeps ONLY Devashish (b0f894ce-c34c-4ea4-8eae-b9f3425fec5e), reset to a fresh profile. Everything else is removed.
-- Self-checking: if any assertion fails, the whole transaction rolls back and nothing changes.
-- After it succeeds run:  node scripts/ops/wipe-storage.mjs --project-ref gnswxlfmcwyhmzlfipql --backup-dir ./storage-backup --confirm

begin;

-- 0. Safety rails ---------------------------------------------------------------------------------------
do $$
begin
  if (select count(*) from auth.users where id::text = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e') <> 1 then
    raise exception 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e not found in auth.users - aborting';
  end if;
  if not exists (select 1 from public.users where id = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e' and roles @> array['admin']) then
    raise exception 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e is not an admin profile - aborting';
  end if;
  if (select count(*) from wipe_backup_20261018.users) <> 36 then
    raise exception 'in-database backup missing - aborting';
  end if;
end $$;

-- 1. Detach profiles from societies (a kept table pointing at a table we empty blocks TRUNCATE) ----------------------------------------------------
update public.users set society_id = null;   -- every user: users.society_id -> societies is a NO ACTION FK

-- 2. Truncate every user-data table (no CASCADE: if a kept table still references one, Postgres refuses and the
--    whole transaction fails safely). Fires no row triggers, so no notification/push storm. -----------------------
do $$
declare tbls text;
begin
  select string_agg(format('public.%I', tablename), ', ' order by tablename) into tbls
  from pg_tables
  where schemaname = 'public'
    and tablename not in ('users', 'societies', 'categories', 'spatial_ref_sys', 'moderation_settings', 'admin_actions',
                          'terms_acceptances', 'customer_onboarding_state');
  execute 'truncate table ' || tbls || ' restart identity';
end $$;

-- societies is referenced by users.society_id, so TRUNCATE refuses it; empty it with DELETE (everything that
-- referenced it was truncated above and every user's society_id is already null).
delete from public.societies;

-- 3. Per-user config tables: keep only the admin's rows ---------------------------------------------------------
delete from public.terms_acceptances         where user_id <> 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e';
delete from public.customer_onboarding_state where user_id <> 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e';

-- 4. Everyone else: profiles, then auth accounts (cascades identities, sessions, refresh tokens, MFA) -----------
delete from public.users where id <> 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e';
delete from auth.users   where id::text <> 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e';

-- 5. Fresh admin profile --------------------------------------------------------------------------------------
update public.users set
  avatar = null, area = null, city = null, lat = null, lng = null, society_id = null, unit_number = null,
  rating_avg = 0, rating_count = 0, language = 'en', notification_radius_km = 5,
  customer_enabled = true, customer_deleted_at = null,
  show_posts_publicly = true, show_asks_publicly = true, show_badges_publicly = true, show_phone_publicly = true,
  show_city_publicly = true, show_rating_publicly = true, show_email_publicly = false, location_public = false,
  show_name_publicly = false,
  switch_pin_hash = null, business_password_hash = null, provider_password_hash = null,
  business_recovery_question_id = null, business_recovery_question_text = null, business_recovery_answer_hash = null,
  provider_recovery_question_id = null, provider_recovery_question_text = null, provider_recovery_answer_hash = null,
  notif_new_business = true, notif_nearby_requests = true, notif_offers = true, notif_silent = false,
  notif_quiet_hours = false, notif_nearby_alerts = true, timezone = null, interest_category_ids = null,
  roles = array(select r from unnest(roles) r where r in ('customer', 'admin', 'super_admin'))
          || case when 'customer' = any(roles) then '{}'::text[] else array['customer'] end
where id = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e';

-- 6. Assert the result. Any failure raises and rolls EVERYTHING back. -------------------------------------------
do $$
declare bad text;
begin
  if (select count(*) from public.users) <> 1 then raise exception 'public.users should have 1 row'; end if;
  if (select count(*) from auth.users)   <> 1 then raise exception 'auth.users should have 1 row';   end if;
  if (select count(*) from public.categories) < 1 then raise exception 'categories were emptied'; end if;
  if not exists (select 1 from public.users where id = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e' and roles @> array['admin']) then
    raise exception 'admin role lost';
  end if;
  select string_agg(tablename, ', ') into bad
  from pg_tables t
  where schemaname = 'public'
    and tablename not in ('users', 'categories', 'spatial_ref_sys', 'moderation_settings', 'admin_actions',
                          'terms_acceptances', 'customer_onboarding_state')
    and (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', tablename), false, true, '')))[1]::text::int > 0;
  if bad is not null then raise exception 'tables not empty: %', bad; end if;
end $$;

-- Result you should see: 1 / 1 / 1+ identity / categories unchanged / admin keeps admin role.
select (select count(*) from public.users) as profiles,
       (select count(*) from auth.users) as auth_users,
       (select count(*) from auth.identities) as identities,
       (select count(*) from public.categories) as categories,
       (select count(*) from public.admin_actions) as admin_actions,
       (select roles::text from public.users limit 1) as admin_roles;

commit;
