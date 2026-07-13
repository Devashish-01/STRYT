-- ============================================================
-- NAYA — RPC functions (run AFTER schema.sql)
-- These return rows with a computed distance_km so the frontend
-- feeds can sort by real nearness. Call from the app via
-- supabase.rpc('businesses_nearby', { in_lng, in_lat, ... }).
-- ============================================================

-- Businesses near a point, sorted by distance. ----------------
create or replace function public.businesses_nearby(
  in_lng        double precision,
  in_lat        double precision,
  in_radius_km  double precision default 50,
  in_category   text default null,
  in_limit      int default 20,
  in_offset     int default 0
)
returns setof public.businesses as $$
  select b.*
  from public.businesses b
  where b.status = 'ACTIVE'
    and (in_category is null or b.category_id = in_category)
    and (
      b.geom is null
      or ST_DWithin(b.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography, in_radius_km * 1000)
    )
  order by
    case when b.geom is null then 1e9
         else ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography)
    end asc
  limit in_limit offset in_offset;
$$ language sql stable;

-- Providers near a point, sorted by distance. -----------------
create or replace function public.providers_nearby(
  in_lng        double precision,
  in_lat        double precision,
  in_radius_km  double precision default 50,
  in_category   text default null,
  in_limit      int default 20,
  in_offset     int default 0
)
returns setof public.providers as $$
  select p.*
  from public.providers p
  where p.status = 'ACTIVE'
    and (in_category is null or p.category_id = in_category)
    and (
      p.geom is null
      or ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography, in_radius_km * 1000)
    )
  order by
    case when p.geom is null then 1e9
         else ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography)
    end asc
  limit in_limit offset in_offset;
$$ language sql stable;

-- Helper to compute distance_km for a single row (used on detail screens).
create or replace function public.distance_km(
  in_lng double precision, in_lat double precision,
  row_lng double precision, row_lat double precision
)
returns double precision as $$
  select ST_Distance(
    ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(row_lng, row_lat), 4326)::geography
  ) / 1000.0;
$$ language sql immutable;
