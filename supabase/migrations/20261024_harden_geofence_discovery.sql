-- Migration: 20261024_harden_geofence_discovery.sql
-- SEC-GEO-01 & SEC-GEO-02: Server-side geofence boundary enforcement & anti-enumeration
--
-- 1. Enforces strict server-side 1.0 km radius clamp for unauthenticated/guest callers (anon)
--    across all public spatial discovery RPCs:
--      - businesses_nearby
--      - providers_nearby
--      - community_posts_nearby
--      - stories_nearby
--      - search_businesses_nearby
--      - search_providers_nearby
--      - category_counts_nearby
-- 2. Caps authenticated queries to max 50.0 km to prevent wide-area table scan DoS attacks.
-- 3. Validates geographic coordinate bounds (-90 <= lat <= 90, -180 <= lng <= 180).
-- 4. Retains SECURITY INVOKER, so existing table RLS and column privileges
--    still apply. These full-row RPCs must never run as SECURITY DEFINER.
-- 5. Retains existing EXECUTE grants without expanding caller privileges.

-- ============================================================================
-- 1. businesses_nearby
-- ============================================================================
create or replace function public.businesses_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 50,
  in_category     text default null,
  in_limit        int default 20,
  in_offset       int default 0,
  in_category_ids text[] default null
)
returns setof public.businesses
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_effective_radius double precision;
  v_effective_limit  integer;
  v_is_anon          boolean := (auth.role() = 'anon' or auth.uid() is null);
begin
  if in_lat is null or in_lng is null then
    return;
  end if;

  if in_lat < -90 or in_lat > 90 or in_lng < -180 or in_lng > 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

  -- Server-side boundary clamp:
  -- Guests cannot query beyond 1.0 km under any circumstance
  -- Authenticated users are capped at 50.0 km
  if v_is_anon then
    v_effective_radius := least(greatest(coalesce(in_radius_km, 1.0), 0.05), 1.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 20), 1), 25);
  else
    v_effective_radius := least(greatest(coalesce(in_radius_km, 50.0), 0.05), 50.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 20), 1), 100);
  end if;

  return query
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
      v_effective_radius * 1000
    )
  order by ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit v_effective_limit
  offset greatest(coalesce(in_offset, 0), 0);
end;
$$;


-- ============================================================================
-- 2. providers_nearby
-- ============================================================================
create or replace function public.providers_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 50,
  in_category     text default null,
  in_limit        int default 20,
  in_offset       int default 0,
  in_category_ids text[] default null
)
returns setof public.providers
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_effective_radius double precision;
  v_effective_limit  integer;
  v_is_anon          boolean := (auth.role() = 'anon' or auth.uid() is null);
begin
  if in_lat is null or in_lng is null then
    return;
  end if;

  if in_lat < -90 or in_lat > 90 or in_lng < -180 or in_lng > 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

  if v_is_anon then
    v_effective_radius := least(greatest(coalesce(in_radius_km, 1.0), 0.05), 1.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 20), 1), 25);
  else
    v_effective_radius := least(greatest(coalesce(in_radius_km, 50.0), 0.05), 50.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 20), 1), 100);
  end if;

  return query
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
      v_effective_radius * 1000
    )
  order by ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit v_effective_limit
  offset greatest(coalesce(in_offset, 0), 0);
end;
$$;


-- ============================================================================
-- 3. community_posts_nearby
-- ============================================================================
create or replace function public.community_posts_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 10,
  in_limit        integer default 50,
  in_offset       integer default 0
)
returns setof public.community_posts
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_effective_radius double precision;
  v_effective_limit  integer;
  v_is_anon          boolean := (auth.role() = 'anon' or auth.uid() is null);
begin
  if in_lat is null or in_lng is null then
    return;
  end if;

  if in_lat < -90 or in_lat > 90 or in_lng < -180 or in_lng > 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

  if v_is_anon then
    v_effective_radius := least(greatest(coalesce(in_radius_km, 1.0), 0.05), 1.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 50), 1), 30);
  else
    v_effective_radius := least(greatest(coalesce(in_radius_km, 50.0), 0.05), 50.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 50), 1), 100);
  end if;

  return query
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
        v_effective_radius,
        case
          when cp.author_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
          when cp.author_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
          else v_effective_radius
        end
      ) * 1000
    )
  order by cp.created_at desc
  limit v_effective_limit
  offset greatest(coalesce(in_offset, 0), 0);
end;
$$;


-- ============================================================================
-- 4. stories_nearby
-- ============================================================================
create or replace function public.stories_nearby(
  in_lng          double precision,
  in_lat          double precision,
  in_radius_km    double precision default 5,
  in_limit        integer default 50
)
returns setof public.stories
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_effective_radius double precision;
  v_effective_limit  integer;
  v_is_anon          boolean := (auth.role() = 'anon' or auth.uid() is null);
begin
  if in_lat is null or in_lng is null then
    return;
  end if;

  if in_lat < -90 or in_lat > 90 or in_lng < -180 or in_lng > 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

  if v_is_anon then
    v_effective_radius := least(greatest(coalesce(in_radius_km, 1.0), 0.05), 1.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 50), 1), 30);
  else
    v_effective_radius := least(greatest(coalesce(in_radius_km, 50.0), 0.05), 50.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 50), 1), 100);
  end if;

  return query
  select s.*
  from public.stories s
  left join public.businesses b on s.owner_type = 'business' and b.id = s.owner_id
  left join public.providers  p on s.owner_type = 'provider'  and p.id = s.owner_id
  where s.expires_at > now()
    and (not v_is_anon or s.geom is not null)
    and (
      s.geom is null
      or ST_DWithin(
        s.geom,
        ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
        least(
          v_effective_radius,
          case
            when s.owner_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
            when s.owner_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
            else v_effective_radius
          end
        ) * 1000
      )
    )
  order by s.created_at desc
  limit v_effective_limit;
end;
$$;


-- ============================================================================
-- 5. search_businesses_nearby & search_providers_nearby
-- ============================================================================
create or replace function public.search_businesses_nearby(
  in_q text,
  in_lng double precision default null,
  in_lat double precision default null,
  in_radius_km double precision default 25,
  in_limit integer default 20,
  in_offset integer default 0
)
returns setof public.businesses
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_effective_radius double precision;
  v_effective_limit  integer;
  v_is_anon          boolean := (auth.role() = 'anon' or auth.uid() is null);
  v_clean_q          text := nullif(trim(coalesce(in_q, '')), '');
begin
  if v_is_anon and (in_lat is null or in_lng is null) then
    return;
  end if;
  if in_lat is not null and (in_lat < -90 or in_lat > 90) then
    raise exception 'INVALID_COORDINATES';
  end if;
  if in_lng is not null and (in_lng < -180 or in_lng > 180) then
    raise exception 'INVALID_COORDINATES';
  end if;

  if v_is_anon then
    v_effective_radius := least(greatest(coalesce(in_radius_km, 1.0), 0.05), 1.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 20), 1), 25);
  else
    v_effective_radius := least(greatest(coalesce(in_radius_km, 50.0), 0.05), 50.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 20), 1), 100);
  end if;

  return query
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
      or (b.geom is not null and ST_DWithin(b.geom, v.pt, v_effective_radius * 1000))
    )
    and (
      v_clean_q is null
      or b.name ilike '%' || v_clean_q || '%'
      or b.category_name ilike '%' || v_clean_q || '%'
      or coalesce(b.sub_category, '') ilike '%' || v_clean_q || '%'
      or exists (
        select 1 from public.catalog_items ci
        where ci.business_id = b.id
          and (ci.name ilike '%' || v_clean_q || '%' or coalesce(ci.description, '') ilike '%' || v_clean_q || '%')
      )
    )
  order by
    case when v.pt is not null and b.geom is not null then ST_Distance(b.geom, v.pt) end asc nulls last,
    b.rating_avg desc nulls last,
    b.id asc
  limit v_effective_limit
  offset greatest(coalesce(in_offset, 0), 0);
end;
$$;


create or replace function public.search_providers_nearby(
  in_q text,
  in_lng double precision default null,
  in_lat double precision default null,
  in_radius_km double precision default 25,
  in_limit integer default 20,
  in_offset integer default 0
)
returns setof public.providers
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_effective_radius double precision;
  v_effective_limit  integer;
  v_is_anon          boolean := (auth.role() = 'anon' or auth.uid() is null);
  v_clean_q          text := nullif(trim(coalesce(in_q, '')), '');
begin
  if v_is_anon and (in_lat is null or in_lng is null) then
    return;
  end if;
  if in_lat is not null and (in_lat < -90 or in_lat > 90) then
    raise exception 'INVALID_COORDINATES';
  end if;
  if in_lng is not null and (in_lng < -180 or in_lng > 180) then
    raise exception 'INVALID_COORDINATES';
  end if;

  if v_is_anon then
    v_effective_radius := least(greatest(coalesce(in_radius_km, 1.0), 0.05), 1.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 20), 1), 25);
  else
    v_effective_radius := least(greatest(coalesce(in_radius_km, 50.0), 0.05), 50.0);
    v_effective_limit  := least(greatest(coalesce(in_limit, 20), 1), 100);
  end if;

  return query
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
      or (p.geom is not null and ST_DWithin(p.geom, v.pt, v_effective_radius * 1000))
    )
    and (
      v_clean_q is null
      or p.display_name ilike '%' || v_clean_q || '%'
      or p.category_name ilike '%' || v_clean_q || '%'
      or coalesce(p.sub_category, '') ilike '%' || v_clean_q || '%'
      or exists (
        select 1 from public.catalog_items ci
        where ci.provider_id = p.id
          and (ci.name ilike '%' || v_clean_q || '%' or coalesce(ci.description, '') ilike '%' || v_clean_q || '%')
      )
    )
  order by
    case when v.pt is not null and p.geom is not null then ST_Distance(p.geom, v.pt) end asc nulls last,
    p.rating_avg desc nulls last,
    p.id asc
  limit v_effective_limit
  offset greatest(coalesce(in_offset, 0), 0);
end;
$$;


-- ============================================================================
-- 6. category_counts_nearby
-- ============================================================================
create or replace function public.category_counts_nearby(
  in_lng double precision default null,
  in_lat double precision default null,
  in_radius_km double precision default null
)
returns table (category_id text, kind text, listings integer)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_effective_radius double precision;
  v_is_anon          boolean := (auth.role() = 'anon' or auth.uid() is null);
begin
  if v_is_anon and (in_lat is null or in_lng is null) then
    return;
  end if;
  if in_lat is not null and (in_lat < -90 or in_lat > 90) then
    raise exception 'INVALID_COORDINATES';
  end if;
  if in_lng is not null and (in_lng < -180 or in_lng > 180) then
    raise exception 'INVALID_COORDINATES';
  end if;

  if v_is_anon then
    v_effective_radius := least(greatest(coalesce(in_radius_km, 1.0), 0.05), 1.0);
  elsif in_radius_km is not null then
    v_effective_radius := least(greatest(in_radius_km, 0.05), 50.0);
  else
    v_effective_radius := null;
  end if;

  return query
  with viewer as (
    select case
      when in_lat is null or in_lng is null or v_effective_radius is null then null
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
     and (v.pt is null or (b.geom is not null and ST_DWithin(b.geom, v.pt, v_effective_radius * 1000)))
   group by b.category_id
  union all
  select p.category_id, 'provider'::text as kind, count(*)::integer as listings
    from public.providers p
    cross join viewer v
   where p.status = 'ACTIVE'
     and p.owner_enabled = true
     and p.deleted_at is null
     and p.category_id is not null
     and (v.pt is null or (p.geom is not null and ST_DWithin(p.geom, v.pt, v_effective_radius * 1000)))
   group by p.category_id;
end;
$$;
