-- ============================================================
-- Business location change — admin review gate
-- ============================================================
-- A business owner may move their shop's location ONLY through an explicit
-- full-map picker, and the move must be APPROVED BY AN ADMIN before it goes
-- live. The live coordinates (businesses.lat/lng, and the geom the
-- `businesses_geom` BEFORE INSERT/UPDATE trigger derives from them) are what
-- discovery reads (businesses_nearby / discoveryService, filtered to
-- status='ACTIVE'), so they must never change until an admin signs off — and
-- must NEVER auto-update from the owner's device location.
--
-- The flow this migration backs:
--   1. Owner picks a new spot on the map  ->  businessService.requestLocationChange()
--        writes ONLY the staging columns below (pending_lat/pending_lng),
--        sets location_review_status='PENDING', stamps pending_location_requested_at.
--        The live lat/lng/geom are left untouched, so the shop stays exactly
--        where it is in discovery while the request is queued.
--   2. Admin reviews (AdminPanel "Location changes") ->
--        approveLocationChange(): copies pending_lat/lng onto the live lat/lng
--          (geom re-syncs automatically via the businesses_geom trigger),
--          clears the staging columns, resets status to 'NONE'.
--        rejectLocationChange(): just clears the staging columns + status,
--          leaving the live location unchanged.
--
-- ── Columns added to public.businesses ─────────────────────────────────────
--   pending_lat                    double precision  — staged latitude  (null unless a change is queued)
--   pending_lng                    double precision  — staged longitude (null unless a change is queued)
--   location_review_status         text NOT NULL DEFAULT 'NONE'  — 'NONE' | 'PENDING'
--   pending_location_requested_at  timestamptz       — when the owner submitted the pending change
--
-- All columns are additive and nullable (except the status, which defaults to
-- 'NONE' and is backfilled onto existing rows by the DEFAULT). Nothing here
-- touches the live lat/lng/geom or any existing column.
-- ============================================================

alter table public.businesses
  add column if not exists pending_lat double precision;

alter table public.businesses
  add column if not exists pending_lng double precision;

alter table public.businesses
  add column if not exists location_review_status text not null default 'NONE'
    check (location_review_status in ('NONE', 'PENDING'));

alter table public.businesses
  add column if not exists pending_location_requested_at timestamptz;

-- Small partial index so the admin review queue (which lists only the handful
-- of businesses with a change awaiting sign-off) doesn't scan the whole table.
create index if not exists businesses_location_review_pending_idx
  on public.businesses (location_review_status)
  where location_review_status = 'PENDING';

-- ── RLS / privileges — verified, no change required ─────────────────────────
-- Checked pg_policies + information_schema before writing this:
--   * businesses UPDATE is a TABLE-LEVEL grant to `authenticated`
--     (information_schema.table_privileges), so it automatically covers these
--     four new columns — no per-column GRANT is needed (the same reason the
--     20260815 verification columns needed none).
--   * The owner-update policy `upd_businesses` is ROW-level
--     (using/with check: owner_user_id = auth.uid()::text OR
--     can_manage_business(id)) — it is NOT column-restricted, so an owner can
--     already write the pending_* / location_review_status columns on their
--     OWN row via requestLocationChange().
--   * The admin-update policy `admin_upd_businesses` lets an admin promote
--     pending_lat/lng onto the live lat/lng on approval.
-- No existing policy is altered or weakened here.
