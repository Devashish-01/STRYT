-- Migration: 20260961_ci_readonly_role.sql
-- Description: Create least-privilege CI role for schema drift detection

create role ci_readonly nologin noinherit;
grant connect on database postgres to ci_readonly;
grant usage on schema supabase_migrations to ci_readonly;
grant select on supabase_migrations.schema_migrations to ci_readonly;
