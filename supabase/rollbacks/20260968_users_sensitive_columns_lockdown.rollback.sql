-- Rollback for 20260968_users_sensitive_columns_lockdown.sql
--
-- Restores table-level SELECT on public.users for anon and authenticated, as it was before.
-- ⚠ Re-opens the leak: password/recovery hashes, email, exact location readable by any signed-in user.

revoke select (id, name, avatar, roles, area, city, rating_avg, rating_count, language, notification_radius_km, created_at, society_id, alias, customer_enabled, customer_deleted_at, show_posts_publicly, show_asks_publicly, show_badges_publicly, show_phone_publicly, show_city_publicly, show_rating_publicly, show_email_publicly, location_public, onboarding_completed_at, show_name_publicly, terms_accepted_version, terms_accepted_at, notif_new_business, notif_nearby_requests, notif_offers, notif_silent, notif_quiet_hours, timezone, interest_category_ids, notif_nearby_alerts, phone) on public.users from authenticated;
revoke select (id, name, avatar, roles, area, city, rating_avg, rating_count, language, notification_radius_km, created_at, society_id, alias, customer_enabled, customer_deleted_at, show_posts_publicly, show_asks_publicly, show_badges_publicly, show_phone_publicly, show_city_publicly, show_rating_publicly, show_email_publicly, location_public, onboarding_completed_at, show_name_publicly, terms_accepted_version, terms_accepted_at, notif_new_business, notif_nearby_requests, notif_offers, notif_silent, notif_quiet_hours, timezone, interest_category_ids, notif_nearby_alerts) on public.users from anon;
grant select on table public.users to anon, authenticated;

notify pgrst, 'reload schema';
