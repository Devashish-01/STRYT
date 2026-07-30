-- ============================================================
-- 20260866 — Cap business/provider community posts by author's own radius
--
-- community_posts_nearby previously used only the viewer's in_radius_km.
-- Business/provider-authored posts now respect min(viewer radius, author's
-- broadcast_radius / service_radius_km). Plain user posts unchanged.
-- Same 5-param signature — plain CREATE OR REPLACE.
-- ============================================================

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
