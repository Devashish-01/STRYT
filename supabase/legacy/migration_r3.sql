-- ============================================================
-- NAYA — R3 migration: provider goes live + category proposals
-- Run AFTER migration_writes.sql. Safe to re-run.
-- ============================================================

-- Allow authenticated users to insert new category proposals.
-- (Admin/service-role can still update/delete; owners can't edit existing seeds.)
do $$ begin
  create policy ins_categories on public.categories
    for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
