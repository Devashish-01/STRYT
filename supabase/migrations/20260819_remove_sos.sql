-- 20260819 — Remove the old SMS-based SOS entirely.
--
-- Superseded by live location sharing (20260818). This drops the SOS data model
-- and the free-text emergency-contact fields it depended on. The sos-alert edge
-- function is deleted separately (repo + dashboard), and MSG91 secrets removed.
-- Runs AFTER 20260818 so the replacement model is already in place.
--
-- NOTE: agreements.provider_lat/lng/live_status and tracking_tokens are the
-- provider-en-route tracking feature — a DIFFERENT feature — and are NOT touched.

-- get_own_emergency_contact() reads the columns below, so drop it first.
drop function if exists public.get_own_emergency_contact();

drop table if exists public.sos_alerts;

alter table public.users
  drop column if exists emergency_contact,
  drop column if exists emergency_contact_name;
