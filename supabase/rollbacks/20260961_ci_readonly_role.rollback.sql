-- Rollback for 20260961_ci_readonly_role.sql
revoke select on supabase_migrations.schema_migrations from ci_readonly;
revoke usage on schema supabase_migrations from ci_readonly;
revoke connect on database postgres from ci_readonly;
drop role if exists ci_readonly;
