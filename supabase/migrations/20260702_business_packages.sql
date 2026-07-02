-- business_packages: mirrors provider_packages for business sellers.
-- Run this in the Supabase SQL editor.

create table if not exists business_packages (
  id           uuid primary key default gen_random_uuid(),
  business_id  text not null references businesses(id) on delete cascade,
  name         text not null,
  "desc"       text not null default '',
  price        numeric(10,2) not null,
  duration     text not null default '',
  instant_book boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists business_packages_business_id_idx on business_packages(business_id);

alter table business_packages enable row level security;

-- Anyone can read packages shown on the public business profile.
create policy "public can read business packages"
  on business_packages for select
  using (true);

-- Only the shop owner can create / delete their packages.
create policy "owner can manage their packages"
  on business_packages for all
  using (
    exists (
      select 1 from businesses
      where businesses.id = business_packages.business_id
        and businesses.owner_user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from businesses
      where businesses.id = business_packages.business_id
        and businesses.owner_user_id = auth.uid()::text
    )
  );
