-- Rollback for 20260958_capture_database_only_objects.sql
--
-- 20260958 captures database-only objects into version control verbatim from the
-- live production catalog snapshot (2026-09-11_after_20260957.sql).
-- Because all definitions in 20260958 are already live in the production database,
-- applying 20260958 to production is a verified no-op.
--
-- ⚠ DO NOT DROP these objects in production: live application features, RLS policies
-- (e.g. can_manage_business, protect_business_owner), and loyalty stamps depend on them.
-- If a rollback of the migration record is needed, delete the ledger row:
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260958';

notify pgrst, 'reload schema';
