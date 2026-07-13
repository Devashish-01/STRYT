-- ============================================================
-- Business portfolio — "past work" gallery, mirroring the provider portfolio
-- (portfolio_items). Customers browse these photos on the business profile.
-- Run manually in Supabase SQL editor.
-- ============================================================

create table if not exists public.business_portfolio_items (
  id          text primary key default gen_random_uuid()::text,
  business_id text not null references public.businesses(id) on delete cascade,
  url         text not null,
  caption     text default '',
  created_at  timestamptz default now()
);

create index if not exists business_portfolio_business_idx
  on public.business_portfolio_items (business_id, created_at desc);

alter table public.business_portfolio_items enable row level security;

-- Public read (portfolios are shown on the public business profile).
do $$ begin
  create policy read_business_portfolio on public.business_portfolio_items
    for select using (true);
exception when duplicate_object then null; end $$;

-- Only the owning business's owner can add/edit/remove.
do $$ begin
  create policy write_business_portfolio on public.business_portfolio_items
    for all
    using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text));
exception when duplicate_object then null; end $$;
