-- ============================================================
-- NAYA — R9 migration: stories, available-now, vouches,
--        endorsements, achievements, leaderboard RPC.
-- Run AFTER migration_r8.sql. Safe to re-run.
-- ============================================================

-- ── 1. AVAILABLE-NOW: two columns on providers ────────────────
alter table public.providers
  add column if not exists is_available_now boolean default false,
  add column if not exists available_until  timestamptz;

-- ── 2. STORIES ────────────────────────────────────────────────
create table if not exists public.stories (
  id           text primary key default ('st_' || replace(gen_random_uuid()::text, '-', '')),
  owner_type   text not null,   -- 'business' | 'provider'
  owner_id     text not null,
  author_name  text not null,
  author_avatar text not null default '',
  image_url    text not null,
  caption      text not null default '',
  cta          text not null default 'None',
  expires_at   timestamptz not null,
  created_at   timestamptz default now()
);

create index if not exists stories_expires_idx on public.stories (expires_at desc);

alter table public.stories enable row level security;

do $$ begin
  -- anyone can read non-expired stories
  create policy read_stories on public.stories
    for select using (expires_at > now());
  -- authenticated users can post stories (owner check is done in the service layer)
  create policy ins_stories on public.stories
    for insert with check (auth.role() = 'authenticated');
  create policy del_stories on public.stories
    for delete using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ── 3. VOUCHES ────────────────────────────────────────────────
create table if not exists public.vouches (
  id            text primary key default ('vc_' || replace(gen_random_uuid()::text, '-', '')),
  from_user_id  text not null references public.users(id) on delete cascade,
  provider_id   text not null references public.providers(id) on delete cascade,
  created_at    timestamptz default now(),
  unique (from_user_id, provider_id)
);

create index if not exists vouches_provider_idx on public.vouches (provider_id);

alter table public.vouches enable row level security;

do $$ begin
  create policy read_vouches on public.vouches for select using (true);
  create policy ins_vouches on public.vouches
    for insert with check (from_user_id = auth.uid()::text);
  create policy del_vouches on public.vouches
    for delete using (from_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── 4. ENDORSEMENTS ───────────────────────────────────────────
create table if not exists public.endorsements (
  id            text primary key default ('en_' || replace(gen_random_uuid()::text, '-', '')),
  from_user_id  text not null references public.users(id) on delete cascade,
  provider_id   text not null references public.providers(id) on delete cascade,
  skill         text not null,
  created_at    timestamptz default now(),
  unique (from_user_id, provider_id, skill)
);

create index if not exists endorsements_provider_idx on public.endorsements (provider_id, skill);

alter table public.endorsements enable row level security;

do $$ begin
  create policy read_endorsements on public.endorsements for select using (true);
  create policy ins_endorsements on public.endorsements
    for insert with check (from_user_id = auth.uid()::text);
  create policy del_endorsements on public.endorsements
    for delete using (from_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- ── 5. LEADERBOARD RPC ────────────────────────────────────────
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
    group by u.id, u.name
    limit 10
  )
  select * from top_providers
  union all
  select * from top_neighbors;
$$;
