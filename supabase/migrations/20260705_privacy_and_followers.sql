-- ============================================================
-- CUST-4 (field-level privacy) + CUST-5 (followers)
-- Run manually in Supabase SQL editor.
-- ============================================================

-- 1. Privacy flags on users. show_posts_publicly/show_asks_publicly/show_badges_publicly
--    already exist live (added out-of-band, never captured in a tracked migration) —
--    these IF NOT EXISTS guards catch the schema history up to reality. The three
--    show_phone/city/rating_publicly columns are new.
alter table public.users
  add column if not exists show_posts_publicly  boolean default true,
  add column if not exists show_asks_publicly   boolean default true,
  add column if not exists show_badges_publicly boolean default true,
  add column if not exists show_phone_publicly  boolean default true,
  add column if not exists show_city_publicly   boolean default true,
  add column if not exists show_rating_publicly boolean default true;

-- 2. Tighten users UPDATE to self-only. Previously any authenticated user could
--    write ANY user's row (no ownership check) — meaningless for privacy flags
--    if someone else can just flip yours. Read stays public (unchanged product
--    behavior: public profiles are discoverable without auth).
drop policy if exists update_users on public.users;
create policy update_users on public.users
  for update using (id = auth.uid()::text);

-- 3. Followers: let anyone read "who follows user X" (target_type = USER),
--    matching the users table's existing public-read posture. The pre-existing
--    read_follows policy (follower_user_id = auth.uid()) still covers "who do
--    I follow" for BUSINESS/PROVIDER targets — this is additive, not a replacement.
drop policy if exists read_followers_of_user on public.follows;
create policy read_followers_of_user on public.follows
  for select using (target_type in ('USER', 'user'));
