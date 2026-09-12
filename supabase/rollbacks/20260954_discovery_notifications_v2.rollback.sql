-- ============================================================
-- Rollback for 20260954_discovery_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Drop brand new function broadcast_offer_to_nearby ─────────────────────────
drop function if exists public.broadcast_offer_to_nearby(text, double precision);

-- ── Drop brand new function broadcast_new_listing ─────────────────────────
drop function if exists public.broadcast_new_listing(text, text);

notify pgrst, 'reload schema';
