-- ============================================================
-- 20260899 — Add the missing bulk_deals.business_id -> businesses(id) FK
--
-- bulk_deals (20260826_bulk_buying.sql) was created with
-- `business_id text not null` and NO foreign key constraint. But
-- bulkService.ts's DEAL_SELECT — used by every read path (deals(),
-- dealsForBusiness(), get(), and the row returned from create()/update())
-- — has always been:
--   "*, business:businesses!business_id(name, cover_image, lat, lng, upi_id)"
-- PostgREST's `table!column(...)` embed syntax resolves a JOIN by looking
-- up a real foreign key relationship in the schema cache — with none
-- declared, there was nothing to find, so every one of those reads has
-- been returning 400 Bad Request ("Could not find a relationship between
-- 'bulk_deals' and 'businesses' in the schema cache") since the feature was
-- built. Writing a deal (create/update's own row-shape write) doesn't hit
-- this, only reading one back through the select does — so this could ship
-- and accept new deals while never being able to list a single one.
--
-- Matches the FK convention every other *_id -> businesses(id) column in
-- this schema already uses (see e.g. business_portfolio, queue tables).
--
-- If this ALTER fails with a foreign-key-violation, some existing
-- bulk_deals row(s) have a business_id that doesn't match any real
-- businesses.id — find them first with:
--   select id, business_id from public.bulk_deals
--    where business_id not in (select id from public.businesses);
-- and decide whether to fix or delete those rows before re-running this.
-- ============================================================

alter table public.bulk_deals
  add constraint bulk_deals_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete cascade;
