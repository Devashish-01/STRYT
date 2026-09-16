-- 20260986_search_nearby_and_category_counts
--
-- GLOBAL_SEARCH S1: search matched name and category text with no spatial bound and no ordering, so results came back
-- in whatever order the table held them — a shop across the city could outrank the one on your street, and paging
-- through them was arbitrary.
-- GLOBAL_SEARCH S2: it also searched only the listing's own name and category, so a shop that sells the thing you
-- typed (a catalog item) or lists it as a sub-category was invisible.
-- CATEGORY_DIRECTORY C2: getCategoryCounts downloaded every active business and provider row to count them on the
-- client. The counts are now done in the database, inside the same radius.
--
-- Both functions mirror businesses_nearby: STABLE sql, geography distance, and the same ACTIVE / owner_enabled /
-- not-deleted visibility rules, so nothing suspended or deleted can surface through them.
--
-- Rollback: supabase/rollbacks/20260986_search_nearby_and_category_counts.rollback.sql

create or replace function public.search_businesses_nearby(
  in_q text,
  in_lng double precision default null,
  in_lat double precision default null,
  in_radius_km double precision default 25,
  in_limit integer default 20,
  in_offset integer default 0
)
 returns setof businesses
 language sql
 stable
 set search_path to 'public'
as $function$
  with viewer as (
    select case
      when in_lat is null or in_lng is null then null
      else ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
    end as pt
  )
  select b.*
  from public.businesses b
  cross join viewer v
  where b.status = 'ACTIVE'
    and b.owner_enabled = true
    and b.deleted_at is null
    and (
      v.pt is null
      or (b.geom is not null and ST_DWithin(b.geom, v.pt, greatest(coalesce(in_radius_km, 25), 1) * 1000))
    )
    and (
      b.name ilike '%' || in_q || '%'
      or b.category_name ilike '%' || in_q || '%'
      or coalesce(b.sub_category, '') ilike '%' || in_q || '%'
      -- What the shop actually sells (S2).
      or exists (
        select 1 from public.catalog_items ci
         where ci.business_id = b.id
           and (ci.name ilike '%' || in_q || '%' or coalesce(ci.description, '') ilike '%' || in_q || '%')
      )
    )
  order by
    case when v.pt is not null and b.geom is not null then ST_Distance(b.geom, v.pt) end asc nulls last,
    b.rating_avg desc nulls last,
    b.id asc
  limit greatest(coalesce(in_limit, 20), 1)
  offset greatest(coalesce(in_offset, 0), 0);
$function$;

create or replace function public.search_providers_nearby(
  in_q text,
  in_lng double precision default null,
  in_lat double precision default null,
  in_radius_km double precision default 25,
  in_limit integer default 20,
  in_offset integer default 0
)
 returns setof providers
 language sql
 stable
 set search_path to 'public'
as $function$
  with viewer as (
    select case
      when in_lat is null or in_lng is null then null
      else ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
    end as pt
  )
  select p.*
  from public.providers p
  cross join viewer v
  where p.status = 'ACTIVE'
    and p.owner_enabled = true
    and p.deleted_at is null
    and (
      v.pt is null
      or (p.geom is not null and ST_DWithin(p.geom, v.pt, greatest(coalesce(in_radius_km, 25), 1) * 1000))
    )
    and (
      p.display_name ilike '%' || in_q || '%'
      or p.category_name ilike '%' || in_q || '%'
      or coalesce(p.sub_category, '') ilike '%' || in_q || '%'
      or exists (
        select 1 from public.catalog_items ci
         where ci.provider_id = p.id
           and (ci.name ilike '%' || in_q || '%' or coalesce(ci.description, '') ilike '%' || in_q || '%')
      )
    )
  order by
    case when v.pt is not null and p.geom is not null then ST_Distance(p.geom, v.pt) end asc nulls last,
    p.rating_avg desc nulls last,
    p.id asc
  limit greatest(coalesce(in_limit, 20), 1)
  offset greatest(coalesce(in_offset, 0), 0);
$function$;

-- C2: one row per category with how many active listings it has nearby, instead of shipping every row to the client.
create or replace function public.category_counts_nearby(
  in_lng double precision default null,
  in_lat double precision default null,
  in_radius_km double precision default null
)
 returns table (category_id text, kind text, listings integer)
 language sql
 stable
 set search_path to 'public'
as $function$
  with viewer as (
    select case
      when in_lat is null or in_lng is null or in_radius_km is null then null
      else ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
    end as pt
  )
  select b.category_id, 'business'::text as kind, count(*)::integer as listings
    from public.businesses b
    cross join viewer v
   where b.status = 'ACTIVE'
     and b.owner_enabled = true
     and b.deleted_at is null
     and b.category_id is not null
     and (v.pt is null or (b.geom is not null and ST_DWithin(b.geom, v.pt, in_radius_km * 1000)))
   group by b.category_id
  union all
  select p.category_id, 'provider'::text as kind, count(*)::integer as listings
    from public.providers p
    cross join viewer v
   where p.status = 'ACTIVE'
     and p.owner_enabled = true
     and p.deleted_at is null
     and p.category_id is not null
     and (v.pt is null or (p.geom is not null and ST_DWithin(p.geom, v.pt, in_radius_km * 1000)))
   group by p.category_id;
$function$;

grant execute on function public.search_businesses_nearby(text, double precision, double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.search_providers_nearby(text, double precision, double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.category_counts_nearby(double precision, double precision, double precision) to anon, authenticated;
