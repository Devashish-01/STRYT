-- ============================================================
-- NAYA — R14: Profile visibility switches & secure deletion
-- ============================================================

-- 1. Create Private Schema if not exists
create schema if not exists private;

-- 2. Add visibility & deletion columns to core tables
alter table public.users
  add column if not exists customer_enabled boolean not null default true,
  add column if not exists customer_deleted_at timestamptz;

alter table public.businesses
  add column if not exists owner_enabled boolean not null default true,
  add column if not exists disabled_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.providers
  add column if not exists owner_enabled boolean not null default true,
  add column if not exists disabled_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- 3. Create Admin Action Logs
create table if not exists private.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id text not null,
  action text not null,
  target_type text not null,
  target_id text,
  reason text not null,
  deletion_job_id uuid,
  created_at timestamptz not null default now()
);

-- 4. Create Deletion Requests Table
create table if not exists public.profile_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  target_type text not null, -- CUSTOMER | BUSINESS | PROVIDER
  target_id text, -- null for CUSTOMER, or business_id/provider_id
  reason text,
  status text not null default 'PENDING', -- PENDING | REVIEWING | APPROVED | COMPLETED | REJECTED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deletion_requests_status_check check (status in ('PENDING', 'REVIEWING', 'APPROVED', 'COMPLETED', 'REJECTED'))
);

-- 5. Enable RLS on deletion requests and define policies
alter table public.profile_deletion_requests enable row level security;

drop policy if exists read_own_deletion_requests on public.profile_deletion_requests;
create policy read_own_deletion_requests on public.profile_deletion_requests
  for select using (
    user_id = auth.uid()::text or exists (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

drop policy if exists insert_own_deletion_requests on public.profile_deletion_requests;
create policy insert_own_deletion_requests on public.profile_deletion_requests
  for insert with check (
    user_id = auth.uid()::text
  );

drop policy if exists update_deletion_requests_admin on public.profile_deletion_requests;
create policy update_deletion_requests_admin on public.profile_deletion_requests
  for update using (
    exists (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

drop policy if exists delete_own_deletion_requests on public.profile_deletion_requests;
create policy delete_own_deletion_requests on public.profile_deletion_requests
  for delete using (
    user_id = auth.uid()::text or exists (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

-- 6. Tighten select policies on core tables for visibility checks
drop policy if exists read_users on public.users;
create policy read_users on public.users
  for select using (
    (customer_enabled = true and customer_deleted_at is null)
    or id = auth.uid()::text
    or exists (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

drop policy if exists read_businesses on public.businesses;
create policy read_businesses on public.businesses
  for select using (
    (status = 'ACTIVE' and owner_enabled = true and deleted_at is null)
    or owner_user_id = auth.uid()::text
    or exists (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

drop policy if exists read_providers on public.providers;
create policy read_providers on public.providers
  for select using (
    (status = 'ACTIVE' and owner_enabled = true and deleted_at is null)
    or user_id = auth.uid()::text
    or exists (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

-- 7. Redefine Nearby Lookup Functions
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
    and b.owner_enabled = true
    and b.deleted_at is null
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
    and p.owner_enabled = true
    and p.deleted_at is null
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

-- 8. Redefine Leaderboard Function
create or replace function public.get_leaderboard()
returns table(
  rank      bigint,
  name      text,
  avatar    text,
  metric    text,
  value     text,
  is_provider boolean
) language sql stable as $$
  with top_providers as (
    select
      row_number() over (order by p.rating_avg desc, p.rating_count desc) as rank,
      p.display_name  as name,
      coalesce(p.avatar, '')            as avatar,
      'Avg rating'                      as metric,
      round(p.rating_avg, 1)::text || ' ★' as value,
      true                              as is_provider
    from public.providers p
    where p.status = 'ACTIVE'
      and p.owner_enabled = true
      and p.deleted_at is null
      and p.rating_count >= 1
    limit 10
  ),
  top_neighbors as (
    select
      row_number() over (order by count(*) desc) as rank,
      u.name           as name,
      ''               as avatar,
      'Jobs done'      as metric,
      count(*)::text || ' jobs' as value,
      false            as is_provider
    from public.agreements ag
    join public.users u on u.id = ag.responder_user_id
    where ag.status = 'COMPLETED'
      and u.customer_enabled = true
      and u.customer_deleted_at is null
    group by u.id, u.name
    limit 10
  )
  select * from top_providers
  union all
  select * from top_neighbors;
$$;
