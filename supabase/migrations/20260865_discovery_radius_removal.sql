-- businesses_nearby/providers_nearby used to cap "nearby" discovery results to
-- min(viewer's radius, listing's own broadcast_radius/service_radius_km).
-- That listing-side clamp is being removed: a listing's own radius now only
-- controls booking eligibility and content (posts/stories/lead-matching)
-- reach, never general discovery. Only the viewer's own search radius
-- (in_radius_km) applies here now. Same 7-param signature, same RETURNS —
-- plain CREATE OR REPLACE, no DROP needed.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as `discovery_radius_removal`.

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
      in_radius_km * 1000
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
      in_radius_km * 1000
    )
  order by ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit in_limit offset in_offset;
$$ language sql stable;

alter function public.businesses_nearby(double precision, double precision, double precision, text, integer, integer, text[]) set search_path = public;
alter function public.providers_nearby(double precision, double precision, double precision, text, integer, integer, text[]) set search_path = public;

grant execute on function public.businesses_nearby(double precision, double precision, double precision, text, integer, integer, text[]) to anon, authenticated;
grant execute on function public.providers_nearby(double precision, double precision, double precision, text, integer, integer, text[]) to anon, authenticated;
