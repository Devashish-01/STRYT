-- Migration 20260968 — stop signed-in users (and guests) reading other users' secrets.
--
-- WHY
--   20260715 (ISS-009) tried to hide phone, email, lat, lng and admin_login_id with
--   `revoke select (<columns>) on public.users`. A column-level REVOKE has no effect
--   while the role still holds table-level SELECT, and `anon` and `authenticated`
--   both do, so nothing was ever hidden. Tested on production 2026-09-15 as a signed-in
--   user who owns nothing: every row passing the read_users policy exposed email (29),
--   lat/lng (20), phone (11), unit_number (4), business_password_hash (2),
--   provider_password_hash (1), business_recovery_answer_hash (1), admin_login_id (1).
--
-- WHAT
--   Replace table-level SELECT with column-level SELECT on the columns the app reads.
--   Row visibility (RLS policy read_users) is unchanged.
--   - Hidden from everyone via the API: email, lat, lng, unit_number, admin_login_id,
--     switch_pin_hash, business/provider password hashes, recovery question ids/texts
--     and answer hashes.
--   - The owner still gets their own full row through get_own_profile() (SECURITY
--     DEFINER), which userService.me() already uses. Admin screens use SECURITY DEFINER
--     RPCs. No policy, view or SECURITY INVOKER function reads these columns (checked).
--   - `phone` stays readable by `authenticated` FOR NOW: the shipped provider leads inbox
--     (providerService.leads, OTA 1.0.63) embeds users.phone. It is revoked by a pending
--     follow-up once the app that no longer reads it is live (supabase/pending/).
--   - `anon` gets the same safe columns so guest pages that embed users(name, alias, …)
--     keep working; read_users returns no rows to guests anyway.
--   Checked against the shipped bundle and src: no users query selects, filters on, or
--   returns (`select()` / `*`) any column hidden here.

revoke select on table public.users from anon, authenticated;

grant select (
  id, name, avatar, roles, area, city, rating_avg, rating_count, language,
  notification_radius_km, created_at, society_id, alias, customer_enabled,
  customer_deleted_at, show_posts_publicly, show_asks_publicly, show_badges_publicly,
  show_phone_publicly, show_city_publicly, show_rating_publicly, show_email_publicly,
  location_public, onboarding_completed_at, show_name_publicly, terms_accepted_version,
  terms_accepted_at, notif_new_business, notif_nearby_requests, notif_offers,
  notif_silent, notif_quiet_hours, timezone, interest_category_ids, notif_nearby_alerts,
  phone
) on public.users to authenticated;

grant select (
  id, name, avatar, roles, area, city, rating_avg, rating_count, language,
  notification_radius_km, created_at, society_id, alias, customer_enabled,
  customer_deleted_at, show_posts_publicly, show_asks_publicly, show_badges_publicly,
  show_phone_publicly, show_city_publicly, show_rating_publicly, show_email_publicly,
  location_public, onboarding_completed_at, show_name_publicly, terms_accepted_version,
  terms_accepted_at, notif_new_business, notif_nearby_requests, notif_offers,
  notif_silent, notif_quiet_hours, timezone, interest_category_ids, notif_nearby_alerts
) on public.users to anon;

notify pgrst, 'reload schema';
