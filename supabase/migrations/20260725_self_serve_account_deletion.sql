-- Self-serve account deletion purge schedule.
--
-- Automated: .github/workflows/purge-deleted-accounts.yml (daily cron with
-- service-role JWT). Manual: POST .../functions/v1/purge-deleted-accounts
-- with Authorization: Bearer <SERVICE_ROLE_KEY>.
--
-- Users who reopen the app after the 30-day grace also self-purge via the same
-- function with their user JWT.

select 1;
