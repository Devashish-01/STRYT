-- ============================================================
-- Closes the remaining realtime-publication gaps found by the codebase
-- audit: every one of these tables backs a screen that already fetches
-- live-looking data but only ever refetches on mount. Adding the table to
-- the publication is what actually makes useQueryWithRealtime's
-- postgres_changes subscription receive events — same fix already applied
-- to leads/appointments/queue_tokens earlier this session.
-- Run manually in Supabase SQL editor.
-- ============================================================

do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.post_comments;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.business_qna;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.ratings;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.proposals;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.society_members;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.gate_passes;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.vouches;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.endorsements;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.providers;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.businesses;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.categories;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.reports;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.bug_reports;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.provider_verifications;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.story_views;
exception when others then null; end $$;

-- ── Team roster (BusinessSettings.tsx) — the Team card was permanently empty
-- behind a working-looking "Invite" button (businessService.team() was a
-- stub returning []). This is a real, persisted staff roster: name/phone/role,
-- not a login/access-control system — team members don't get any additional
-- permissions, this just lets an owner keep a record of who works there.
create table if not exists public.business_team_members (
  id          uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  name        text not null,
  phone       text not null,
  avatar      text not null default '',
  role        text not null default 'STAFF' check (role in ('OWNER','MANAGER','STAFF')),
  created_at  timestamptz not null default now()
);
create index if not exists business_team_members_biz_idx on public.business_team_members (business_id, created_at);

alter table public.business_team_members enable row level security;

do $$ begin
  create policy owner_rw_team_members on public.business_team_members
    for all using (
      exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text)
    ) with check (
      exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.business_team_members;
exception when others then null; end $$;

-- ── Leaderboard entries had no id to route to — every row click landed on
-- the same hardcoded /u/u1 regardless of which entry was tapped. Adds a
-- real target_id (provider id or user id) the client can navigate to.
-- The OUT-parameter row shape is changing (new target_id column), so
-- CREATE OR REPLACE alone is rejected by Postgres — drop first.
drop function if exists public.get_leaderboard();
create or replace function public.get_leaderboard()
returns table(
  rank      bigint,
  name      text,
  avatar    text,
  metric    text,
  value     text,
  is_provider boolean,
  target_id text
) language sql stable as $$
  with top_providers as (
    select
      row_number() over (order by p.rating_avg desc, p.rating_count desc) as rank,
      p.display_name  as name,
      coalesce(p.avatar, '')            as avatar,
      'Avg rating'                      as metric,
      round(p.rating_avg, 1)::text || ' ★' as value,
      true                              as is_provider,
      p.id                              as target_id
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
      false            as is_provider,
      u.id             as target_id
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
