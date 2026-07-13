-- ============================================================
-- NAYA — Migration: enable WRITES (run AFTER schema.sql + rls.sql)
-- Adds: auto-generated text IDs, auto profile creation on login,
-- user lat/lng, and owner-scoped RLS so writes are both possible
-- AND secure. Safe to re-run.
-- ============================================================

-- 1) Auto-generate ids so inserts can omit them ---------------
--    (existing seed rows keep their 'b1'/'p1' ids; new rows get prefixed uuids)
alter table public.businesses      alter column id set default ('b_'  || replace(gen_random_uuid()::text, '-', ''));
alter table public.providers       alter column id set default ('p_'  || replace(gen_random_uuid()::text, '-', ''));
alter table public.requests        alter column id set default ('r_'  || replace(gen_random_uuid()::text, '-', ''));
alter table public.proposals       alter column id set default ('pr_' || replace(gen_random_uuid()::text, '-', ''));
alter table public.catalog_items   alter column id set default ('ci_' || replace(gen_random_uuid()::text, '-', ''));
alter table public.offers          alter column id set default ('o_'  || replace(gen_random_uuid()::text, '-', ''));
alter table public.portfolio_items alter column id set default ('pp_' || replace(gen_random_uuid()::text, '-', ''));
alter table public.agreements      alter column id set default ('ag_' || replace(gen_random_uuid()::text, '-', ''));

-- 2) Store user location (used by setLocation + future geo) ----
alter table public.users add column if not exists lat double precision;
alter table public.users add column if not exists lng double precision;

-- 3) Auto-create a public.users profile when an auth user signs up
--    (Supabase-recommended pattern; runs as definer so it bypasses RLS).
--    Fires on INSERT OR UPDATE and never throws, so it can't block sign-up.
--    The app also self-heals the profile client-side on login (ensureProfile).
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, name, phone, roles)
  values (
    new.id::text,
    coalesce(nullif(new.phone, ''), nullif(new.email, ''), 'New user'),
    new.phone,
    '{customer}'
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_auth_user();

-- 4) Replace the broad "authenticated can write" policies with
--    OWNER-SCOPED ones. auth.uid() is a uuid; our ids are text, so cast.
do $$ begin
  -- drop the permissive starter policies if present
  drop policy if exists write_businesses on public.businesses;
  drop policy if exists write_providers  on public.providers;
  drop policy if exists write_requests   on public.requests;
  drop policy if exists write_proposals  on public.proposals;
  drop policy if exists write_users      on public.users;
  drop policy if exists update_users     on public.users;
exception when undefined_object then null; end $$;

-- users: a person may create/update only their OWN row -------
do $$ begin
  create policy ins_users on public.users
    for insert with check (id = auth.uid()::text);
  create policy upd_users on public.users
    for update using (id = auth.uid()::text) with check (id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- businesses: owner == auth user ------------------------------
do $$ begin
  create policy ins_businesses on public.businesses
    for insert with check (owner_user_id = auth.uid()::text);
  create policy upd_businesses on public.businesses
    for update using (owner_user_id = auth.uid()::text) with check (owner_user_id = auth.uid()::text);
  create policy del_businesses on public.businesses
    for delete using (owner_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- providers: owner == auth user -------------------------------
do $$ begin
  create policy ins_providers on public.providers
    for insert with check (user_id = auth.uid()::text);
  create policy upd_providers on public.providers
    for update using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
  create policy del_providers on public.providers
    for delete using (user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- requests: owner == requester --------------------------------
do $$ begin
  create policy ins_requests on public.requests
    for insert with check (requester_user_id = auth.uid()::text);
  create policy upd_requests on public.requests
    for update using (requester_user_id = auth.uid()::text) with check (requester_user_id = auth.uid()::text);
  create policy del_requests on public.requests
    for delete using (requester_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- proposals: responder == auth user ---------------------------
do $$ begin
  create policy ins_proposals on public.proposals
    for insert with check (responder_user_id = auth.uid()::text);
  create policy upd_proposals on public.proposals
    for update using (responder_user_id = auth.uid()::text) with check (responder_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- catalog_items / offers: writable by the PARENT business owner
do $$ begin
  create policy write_catalog on public.catalog_items
    for all
    using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text));
  create policy write_offers on public.offers
    for all
    using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text));
exception when duplicate_object then null; end $$;

-- portfolio_items: writable by the PARENT provider owner -------
do $$ begin
  create policy write_portfolio on public.portfolio_items
    for all
    using (exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text))
    with check (exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text));
exception when duplicate_object then null; end $$;
