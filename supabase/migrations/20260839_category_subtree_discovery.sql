-- ============================================================
-- 20260839 — Category-subtree-aware discovery
--
-- CategoryListing.tsx is entered with a PARENT category id from every call
-- site (AllCategories' grid, Search's `c.parentId ?? c.id`), but businesses/
-- providers are tagged to LEAF subcategory ids. businesses_nearby/
-- providers_nearby only ever supported a single exact category match
-- (in_category), so a parent-id lookup matched nothing — CategoryListing's
-- own client-side filter never had populated subcategory ids to fall back on
-- either (catalogService.get() doesn't build the tree), so the whole screen
-- could silently show empty/truncated results for any category with real
-- subcategories.
--
-- Adds an optional in_category_ids text[] param: matches ANY id in the set
-- (parent + its leaf children), alongside the existing single-value
-- in_category (kept for existing single-category callers like Explore's own
-- chips). Both params default to null and are independent — pass whichever
-- one fits the caller.
--
-- Drops the old 6-param signature FIRST: create-or-replace with a widened
-- parameter list creates a new overload instead of replacing in place when
-- the old signature has fewer params (hit this exact trap with
-- appointment_create in 20260835 — fixed there, avoided here from the start).
-- ============================================================

drop function if exists public.businesses_nearby(double precision, double precision, double precision, text, integer, integer);
drop function if exists public.providers_nearby(double precision, double precision, double precision, text, integer, integer);

create or replace function public.businesses_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 50,
  in_category     text default null,
  in_limit        int default 20,
  in_offset       int default 0,
  in_category_ids text[] default null
)
returns setof public.businesses as $$
  select b.*
  from public.businesses b
  where b.status = 'ACTIVE'
    and b.owner_enabled = true
    and b.deleted_at is null
    and b.geom is not null
    and (in_category is null or b.category_id = in_category)
    and (in_category_ids is null or b.category_id = any(in_category_ids))
    and ST_DWithin(
      b.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      least(in_radius_km, greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)) * 1000
    )
  order by ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit in_limit offset in_offset;
$$ language sql stable;

create or replace function public.providers_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 50,
  in_category     text default null,
  in_limit        int default 20,
  in_offset       int default 0,
  in_category_ids text[] default null
)
returns setof public.providers as $$
  select p.*
  from public.providers p
  where p.status = 'ACTIVE'
    and p.owner_enabled = true
    and p.deleted_at is null
    and p.geom is not null
    and (in_category is null or p.category_id = in_category)
    and (in_category_ids is null or p.category_id = any(in_category_ids))
    and ST_DWithin(
      p.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      least(in_radius_km, greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)) * 1000
    )
  order by ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit in_limit offset in_offset;
$$ language sql stable;

alter function public.businesses_nearby(double precision, double precision, double precision, text, integer, integer, text[]) set search_path = public;
alter function public.providers_nearby(double precision, double precision, double precision, text, integer, integer, text[]) set search_path = public;

grant execute on function public.businesses_nearby(double precision, double precision, double precision, text, integer, integer, text[]) to anon, authenticated;
grant execute on function public.providers_nearby(double precision, double precision, double precision, text, integer, integer, text[]) to anon, authenticated;
