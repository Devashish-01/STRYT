-- ============================================================
-- 20260893 — Saved community posts
--
-- The feed had exactly one way to keep a post: liking it, which is a public
-- signal to the author rather than a private bookmark. So "the plumber someone
-- recommended last week" was only findable by scrolling until you saw it again.
-- A like and a save answer different questions ("I appreciated this" vs "I need
-- this later") and neither can stand in for the other.
--
-- Deliberately a separate table rather than a row in `bookmarks`: bookmarks are
-- typed BUSINESS/PROVIDER/REQUEST and drive the Lists feature, whose UI assumes
-- a listing with a name and a cover photo. A community post isn't one, and
-- widening that type union would have leaked post-shaped rows into every Lists
-- screen.
--
-- Run manually in the Supabase SQL editor (idempotent, safe to re-run).
-- ============================================================

create table if not exists public.post_saves (
  post_id    text not null references public.community_posts(id) on delete cascade,
  user_id    text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- The "my saved posts" read is by user, newest first; the PK already covers the
-- per-post lookups the feed does.
create index if not exists post_saves_user_idx on public.post_saves (user_id, created_at desc);

alter table public.post_saves enable row level security;

-- A save is private. Unlike post_likes (whose counts are public), nobody —
-- including the post's author — has any reason to see who saved it, and
-- exposing that would turn a private bookmark into a disclosed interest.
do $$ begin
  create policy read_own_post_saves on public.post_saves
    for select to authenticated
    using (user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy insert_own_post_saves on public.post_saves
    for insert to authenticated
    with check (user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy delete_own_post_saves on public.post_saves
    for delete to authenticated
    using (user_id = (select auth.uid())::text);
exception when duplicate_object then null; end $$;

-- community_post_delete() (20260837) cascades comments/likes/votes by explicit
-- DELETE before removing the post. post_saves is covered by the ON DELETE
-- CASCADE above, so that function needs no change — noted here because the
-- explicit deletes in it look like the place saves "should" have been added.
