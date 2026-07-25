-- Self-serve account deletion purge schedule note.
--
-- Edge Function: purge-deleted-accounts
-- Schedule daily (Dashboard → Edge Functions → Schedules, or CLI) with:
--   POST .../functions/v1/purge-deleted-accounts
--   Authorization: Bearer <SERVICE_ROLE_KEY>
--
-- Users who reopen the app after the 30-day grace also self-purge via the same
-- function with their user JWT. This migration is a portable no-op.

select 1;
