-- ============================================================
-- Fix lead trend charts (ManageDashboard / ProviderDashboard):
-- 1. business_view_logs/provider_view_logs never existed in any tracked
--    migration and were never written to — bump_business_metric/
--    bump_provider_views only incremented the aggregate counter column, so
--    the 7-day "views" trend line was always flat/empty by construction.
-- 2. Providers had zero lead-recording paths at all (no recordInteraction
--    equivalent existed) — the provider "leads" trend was always zero.
-- 3. Neither `leads` nor `appointments` were in the supabase_realtime
--    publication, so postgres_changes subscriptions on them (including the
--    appointment console realtime wiring from an earlier session) silently
--    received no events.
-- Run manually in Supabase SQL editor.
-- ============================================================

-- 1 · timestamped view logs (the trend charts bucket these by day)
create table if not exists public.business_view_logs (
  id           uuid primary key default gen_random_uuid(),
  business_id  text not null references public.businesses(id) on delete cascade,
  viewed_at    timestamptz not null default now()
);
create table if not exists public.provider_view_logs (
  id           uuid primary key default gen_random_uuid(),
  provider_id  text not null references public.providers(id) on delete cascade,
  viewed_at    timestamptz not null default now()
);
create index if not exists business_view_logs_biz_idx on public.business_view_logs (business_id, viewed_at desc);
create index if not exists provider_view_logs_prov_idx on public.provider_view_logs (provider_id, viewed_at desc);

alter table public.business_view_logs enable row level security;
alter table public.provider_view_logs enable row level security;

do $$ begin
  create policy read_business_view_logs on public.business_view_logs
    for select using (
      exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text)
    );
  create policy ins_business_view_logs on public.business_view_logs
    for insert with check (auth.role() = 'authenticated' or auth.role() = 'anon');
  create policy read_provider_view_logs on public.provider_view_logs
    for select using (
      exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text)
    );
  create policy ins_provider_view_logs on public.provider_view_logs
    for insert with check (auth.role() = 'authenticated' or auth.role() = 'anon');
exception when duplicate_object then null; end $$;

-- 2 · make the view-count RPCs also log a timestamped row (CREATE OR REPLACE
-- is idempotent-safe against whatever version is currently live)
create or replace function public.bump_business_metric(p_business_id text, p_metric text)
returns void as $$
begin
  if p_metric = 'view' then
    update public.businesses set view_count = coalesce(view_count, 0) + 1 where id = p_business_id;
    insert into public.business_view_logs (business_id) values (p_business_id);
  elsif p_metric = 'call' then
    update public.businesses set call_count = coalesce(call_count, 0) + 1 where id = p_business_id;
  elsif p_metric = 'directions' then
    update public.businesses set directions_count = coalesce(directions_count, 0) + 1 where id = p_business_id;
  end if;
end $$ language plpgsql security definer;

create or replace function public.bump_provider_views(p_provider_id text)
returns void as $$
begin
  update public.providers set view_count = coalesce(view_count, 0) + 1 where id = p_provider_id;
  insert into public.provider_view_logs (provider_id) values (p_provider_id);
end $$ language plpgsql security definer;

grant execute on function public.bump_business_metric(text, text) to anon, authenticated;
grant execute on function public.bump_provider_views(text)        to anon, authenticated;

-- 3 · re-apply the Q&A → lead trigger idempotently (only ever existed in the
-- untracked migration_r11.sql — unknown if it was ever actually applied live)
create or replace function public.qna_to_lead()
returns trigger as $$
begin
  insert into public.leads (business_id, from_user_id, kind, note)
  values (new.business_id, new.asker_user_id, 'QUESTION', left(new.question, 120))
  on conflict do nothing;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_qna_lead on public.business_qna;
create trigger trg_qna_lead
  after insert on public.business_qna
  for each row execute function public.qna_to_lead();

-- 4 · realtime publication
do $$ begin
  alter publication supabase_realtime add table public.leads;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.appointments;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.business_view_logs;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.provider_view_logs;
exception when others then null; end $$;
