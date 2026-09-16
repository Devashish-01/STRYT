-- Rollback for 20260981_deletion_request_prev_visibility.sql
-- Drops the column the migration added. public.profile_deletion_requests had no prev_visibility column before the
-- apply (production information_schema, 2026-09-16), so this restores it exactly.
-- WARNING: any visibility captured for a pending deletion is lost, and cancelling such a request falls back to
-- switching the profile and its storefronts back on.

alter table public.profile_deletion_requests
  drop column if exists prev_visibility;
