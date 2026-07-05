-- 20260720 — unify Business & Provider on ONE catalog concept, retiring the
-- separate "packages" model (business_packages / provider_packages).
-- Business already had a catalog; providers get one too by adding a nullable
-- provider_id column to the same catalog_items table.
--
-- business_packages / provider_packages tables are left in place (not
-- dropped — no destructive DB changes without an explicit ask) but the app
-- no longer reads/writes them after this migration.

alter table if exists public.catalog_items
  add column if not exists provider_id text references public.providers(id) on delete cascade;

create index if not exists catalog_items_provider_idx on public.catalog_items (provider_id);

-- Explicit "is this a food item?" flag — decouples the veg/non-veg dot from
-- items it never applied to. Existing rows default to false (several had a
-- stray is_veg=true from before the CRUD had a way to set/clear it, e.g. on
-- clearly-non-food listings) — owners re-tag genuine food items via edit.
alter table if exists public.catalog_items
  add column if not exists is_food boolean not null default false;

update public.catalog_items set is_veg = null where is_food = false;

-- Replace the business-only write policy with one covering either owner.
drop policy if exists write_catalog on public.catalog_items;
create policy write_catalog on public.catalog_items
  for all
  using (
    (business_id is not null and exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
    or
    (provider_id is not null and exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text))
  )
  with check (
    (business_id is not null and exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text))
    or
    (provider_id is not null and exists (select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid()::text))
  );
