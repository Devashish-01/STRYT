-- ============================================================
-- Bug reports tagged by reporter role (customer/business/provider) +
-- admin read/update access. Run manually in Supabase SQL editor.
-- ============================================================

alter table public.bug_reports
  add column if not exists reporter_role text; -- CUSTOMER | BUSINESS | PROVIDER

-- rls.sql only ever granted INSERT on bug_reports/support_tickets ("read access
-- restricted for security") — meaning nobody, including admins, could actually
-- read a submitted bug report back. Add admin-scoped read + status-update access.
do $$ begin
  create policy select_bug_reports_admin on public.bug_reports
    for select using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()::text
          and (u.roles @> array['admin'] or u.roles @> array['super_admin'])
      )
    );
  create policy update_bug_reports_admin on public.bug_reports
    for update using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()::text
          and (u.roles @> array['admin'] or u.roles @> array['super_admin'])
      )
    );
  create policy select_support_tickets_admin on public.support_tickets
    for select using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()::text
          and (u.roles @> array['admin'] or u.roles @> array['super_admin'])
      )
    );
  create policy update_support_tickets_admin on public.support_tickets
    for update using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()::text
          and (u.roles @> array['admin'] or u.roles @> array['super_admin'])
      )
    );
exception when duplicate_object then null; end $$;
