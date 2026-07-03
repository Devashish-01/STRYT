-- ============================================================
-- NAYA — R15: Story Views & Privacy Settings
-- ============================================================

-- 1. Add privacy columns to stories table
alter table public.stories
  add column if not exists visibility text not null default 'everyone',
  add column if not exists allowed_user_ids text[] default '{}',
  add column if not exists hidden_user_ids text[] default '{}';

-- 2. Create story_views table
create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id text not null references public.stories(id) on delete cascade,
  viewer_user_id text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(story_id, viewer_user_id)
);

-- 3. Enable Row Level Security (RLS) on story_views
alter table public.story_views enable row level security;

-- 4. RLS policies for story_views
drop policy if exists read_story_views_owner on public.story_views;
create policy read_story_views_owner on public.story_views
  for select using (
    exists (
      select 1 from public.stories s
      where s.id = story_views.story_id and s.user_id = auth.uid()::text
    ) or exists (
      select 1 from public.users u
      where u.id = auth.uid()::text and 'admin' = any(u.roles)
    )
  );

drop policy if exists insert_story_views_viewer on public.story_views;
create policy insert_story_views_viewer on public.story_views
  for insert with check (
    viewer_user_id = auth.uid()::text
  );
