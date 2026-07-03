-- ============================================================
-- ISS-002 — a business whose owner never touches the "open right now"
-- toggle reads Closed all day, every day, even during its own posted
-- working hours. Root cause: businesses.is_available_now defaults to
-- `false` (migration 20260701_appointments.sql), which is indistinguishable
-- from the owner explicitly switching it off — evaluateProviderAvailability()
-- (src/utils/availability.ts) already treats NULL correctly as "respect
-- posted hours", it just never receives NULL because the column default
-- was wrong.
--
-- Providers are NOT touched here — "offline until you go online" is the
-- intended behavior for providers (per ISSUES.md), this is a businesses-only
-- fix. Safe to reset every current row to NULL rather than only changing the
-- default: this project has no live users yet (pre-launch).
-- ============================================================

alter table public.businesses alter column is_available_now drop default;
alter table public.businesses alter column is_available_now set default null;

update public.businesses set is_available_now = null where is_available_now = false;
