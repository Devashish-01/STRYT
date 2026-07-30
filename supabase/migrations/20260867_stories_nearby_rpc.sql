-- ============================================================
-- 20260867 — stories_nearby RPC (author-radius + location-less passthrough)
--
-- Replaces client-side haversine filtering in socialService.storiesNearby().
-- Business/provider stories respect the owner's broadcast_radius /
-- service_radius_km; user stories use viewer radius only. Stories with
-- geom IS NULL remain visible to everyone (existing product decision).
-- ============================================================

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
