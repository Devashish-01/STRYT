-- ============================================================
-- Account appeals: lets a suspended business/provider owner raise a review
-- request that surfaces in the admin console. Run manually in Supabase SQL editor.
-- ============================================================

create table if not exists public.account_appeals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('BUSINESS', 'PROVIDER')),
  entity_id text not null,
  owner_user_id text not null references public.users(id),
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists account_appeals_owner_idx on public.account_appeals (owner_user_id, created_at desc);
create index if not exists account_appeals_status_idx on public.account_appeals (status, created_at desc);

alter table public.account_appeals enable row level security;

-- Mirrors the admin-role check already used for bug_reports/support_tickets
-- (20260707_bug_report_roles.sql) — owners manage their own appeal, admins see/resolve all.
do $$ begin
  create policy insert_own_appeal on public.account_appeals
    for insert with check (owner_user_id = auth.uid()::text);

  create policy select_own_or_admin_appeal on public.account_appeals
    for select using (
      owner_user_id = auth.uid()::text
      or exists (
        select 1 from public.users u
        where u.id = auth.uid()::text
          and (u.roles @> array['admin'] or u.roles @> array['super_admin'])
      )
    );

  create policy update_appeal_admin on public.account_appeals
    for update using (
      exists (
        select 1 from public.users u
        where u.id = auth.uid()::text
          and (u.roles @> array['admin'] or u.roles @> array['super_admin'])
      )
    );
exception when duplicate_object then null; end $$;
