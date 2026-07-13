-- ============================================================
-- NAYA — Row Level Security (run AFTER schema.sql)
-- Principle: public catalog data is world-readable; writes are
-- restricted to the owner. This is a SAFE STARTING SET for launch.
-- Tighten further as auth.uid() linkage is added.
--
-- NOTE: These policies assume you will eventually store the Supabase
-- auth uid on the users row (e.g. an `auth_uid uuid` column) and link
-- ownership through it. Until phone-auth is wired, the anon key can
-- READ public data, and writes are blocked unless authenticated.
-- ============================================================

-- Enable RLS on every table -----------------------------------
alter table public.users           enable row level security;
alter table public.categories      enable row level security;
alter table public.businesses      enable row level security;
alter table public.catalog_items   enable row level security;
alter table public.offers          enable row level security;
alter table public.providers       enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.requests        enable row level security;
alter table public.proposals       enable row level security;
alter table public.agreements      enable row level security;

-- PUBLIC READ (discovery is open to everyone, even logged-out) -
do $$ begin
  create policy read_categories      on public.categories      for select using (true);
  create policy read_businesses      on public.businesses      for select using (true);
  create policy read_catalog_items   on public.catalog_items   for select using (true);
  create policy read_offers          on public.offers          for select using (true);
  create policy read_providers       on public.providers       for select using (true);
  create policy read_portfolio_items on public.portfolio_items for select using (true);
  create policy read_requests        on public.requests        for select using (true);
  create policy read_proposals       on public.proposals        for select using (true);
exception when duplicate_object then null; end $$;

-- users: a person can read all profiles (public), but only an
-- authenticated session may insert/update. Tighten to self once
-- auth_uid linkage exists.
do $$ begin
  create policy read_users   on public.users for select using (true);
  create policy write_users  on public.users for insert with check (auth.role() = 'authenticated');
  create policy update_users on public.users for update using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- WRITES on owned content require an authenticated session.
-- (Owner-scoped checks via auth.uid() get added when phone-auth lands.)
do $$ begin
  create policy write_businesses on public.businesses
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  create policy write_providers on public.providers
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  create policy write_requests on public.requests
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  create policy write_proposals on public.proposals
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  create policy write_agreements on public.agreements
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- agreements are sensitive: only authenticated sessions can read.
do $$ begin
  create policy read_agreements on public.agreements
    for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- Enable RLS on new support tables
alter table public.support_tickets enable row level security;
alter table public.bug_reports enable row level security;

-- Only authenticated users can write tickets/bug reports. Read access is restricted for security.
do $$ begin
  create policy insert_support_tickets on public.support_tickets
    for insert with check (auth.role() = 'authenticated');
  create policy insert_bug_reports on public.bug_reports
    for insert with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

