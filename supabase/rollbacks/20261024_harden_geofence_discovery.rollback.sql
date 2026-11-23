-- ==============================================================================
-- 20261024 — Harden Geofence Discovery (ROLLBACK)
-- Restores previous definitions of spatial functions prior to server-side clamp
-- ==============================================================================

-- 1. businesses_nearby (reverts to 20260865)
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

alter function public.businesses_nearby(double precision, double precision, double precision, text, integer, integer, text[]) set search_path = public;
grant execute on function public.businesses_nearby(double precision, double precision, double precision, text, integer, integer, text[]) to anon, authenticated;

-- 2. providers_nearby (reverts to 20260865)
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

alter function public.providers_nearby(double precision, double precision, double precision, text, integer, integer, text[]) set search_path = public;
grant execute on function public.providers_nearby(double precision, double precision, double precision, text, integer, integer, text[]) to anon, authenticated;

-- 3. community_posts_nearby (reverts to 20260891)
create or replace function public.community_posts_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 10,
  in_limit        integer default 50,
  in_offset       integer default 0
)
returns setof public.community_posts
language sql
stable
set search_path = public
as $$
  select cp.*
  from public.community_posts cp
  left join public.businesses b
    on cp.author_type = 'business' and b.id = cp.author_ref_id
  left join public.providers p
    on cp.author_type = 'provider' and p.id = cp.author_ref_id
  where cp.geom is not null
    and (cp.expires_at is null or cp.expires_at > now())
    and ST_DWithin(
      cp.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      least(
        in_radius_km,
        case
          when cp.author_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
          when cp.author_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
          else in_radius_km
        end
      ) * 1000
    )
  order by cp.created_at desc
  limit in_limit offset in_offset;
$$;

alter function public.community_posts_nearby(double precision, double precision, double precision, integer, integer) set search_path = public;
grant execute on function public.community_posts_nearby(double precision, double precision, double precision, integer, integer) to anon, authenticated;

-- 4. stories_nearby (reverts to 20260867)
create or replace function public.stories_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 5,
  in_limit        integer default 50
)
returns setof public.stories
language sql
stable
set search_path = public
as $$
  select s.*
  from public.stories s
  left join public.businesses b on s.owner_type = 'business' and b.id = s.owner_id
  left join public.providers  p on s.owner_type = 'provider'  and p.id = s.owner_id
  where s.expires_at > now()
    and (
      s.geom is null
      or ST_DWithin(
        s.geom,
        ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
        least(
          in_radius_km,
          case
            when s.owner_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
            when s.owner_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
            else in_radius_km
          end
        ) * 1000
      )
    )
  order by s.created_at desc
  limit in_limit;
$$;

alter function public.stories_nearby(double precision, double precision, double precision, integer) set search_path = public;
grant execute on function public.stories_nearby(double precision, double precision, double precision, integer) to anon, authenticated;
