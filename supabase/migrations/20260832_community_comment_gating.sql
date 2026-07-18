-- ============================================================
-- Community comment gating + story-view RLS fix.
-- Run manually in the Supabase SQL editor (idempotent, safe to re-run).
--
-- Three concerns, one migration:
--   1. community_posts.allow_comments — commenting is OFF by default; the
--      poster must opt in.
--   2. can_comment_on_post() + a tightened post_comments INSERT policy —
--      even when comments are on, only the post author OR a MUTUAL follower
--      (both directions in `follows`) may comment. Enforced server-side so
--      the client pre-check can't be bypassed.
--   3. story_views UPDATE policy — recordStoryView()/reactToStory() upsert
--      onConflict(story_id,viewer_user_id); a repeat view or a reaction on an
--      already-viewed story becomes an UPDATE, which had no policy and was
--      silently rejected. This is the story-view RLS gap surfaced while
--      investigating the story-viewer display bug (Task 1).
-- ============================================================


-- ── 1. allow_comments column ─────────────────────────────────
-- NOT NULL DEFAULT false: existing rows backfill to false (comments off),
-- matching the new product default.
alter table public.community_posts
  add column if not exists allow_comments boolean not null default false;

comment on column public.community_posts.allow_comments is
  'When true, commenting is enabled on this post (still gated to author + mutual followers). Default false = comments off.';


-- ── 2. Comment-permission predicate ──────────────────────────
-- Returns true only when the post allows comments AND the caller is either
-- the post author or a mutual follower of the author. SECURITY DEFINER so it
-- can read `follows`/`community_posts` regardless of the caller's own RLS,
-- with search_path pinned to public (never trust the caller's search_path in
-- a definer function). Every branch is exists()/coalesce() so the result is
-- always a concrete boolean — a null (e.g. unauthenticated caller) collapses
-- to false and the comment is rejected.
create or replace function public.can_comment_on_post(p_post_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(
      (select p.allow_comments from public.community_posts p where p.id = p_post_id),
      false
    )
    and (
      -- (a) the author may always comment on their own post
      exists (
        select 1 from public.community_posts p
        where p.id = p_post_id
          and p.author_user_id = auth.uid()::text
      )
      or
      -- (b) mutual follow: caller follows the author AND the author follows the
      --     caller, both as USER-target rows ('USER'/'user' are both accepted).
      (
        exists (
          select 1 from public.follows f
          where f.follower_user_id = auth.uid()::text
            and f.target_id = (select author_user_id from public.community_posts where id = p_post_id)
            and f.target_type in ('USER', 'user')
        )
        and exists (
          select 1 from public.follows f
          where f.follower_user_id = (select author_user_id from public.community_posts where id = p_post_id)
            and f.target_id = auth.uid()::text
            and f.target_type in ('USER', 'user')
        )
      )
    );
$$;

-- Callable by the authenticated role (the INSERT policy below evaluates it as
-- the acting user; the app may also call it via rpc). anon/public don't need
-- it — the whole app is gated behind auth — so mirror the go-live hardening
-- posture and revoke them.
revoke execute on function public.can_comment_on_post(text) from public;
revoke execute on function public.can_comment_on_post(text) from anon;
grant execute on function public.can_comment_on_post(text) to authenticated;


-- ── 3. post_comments INSERT policy ───────────────────────────
-- Replaces the plain "author_user_id = me" insert policy (20260807) with one
-- that ALSO requires can_comment_on_post(). Postgres OR-combines permissive
-- policies, so this must REPLACE the old one (a second policy would only
-- loosen the rule) — this is the authoritative, un-bypassable enforcement.
alter table public.post_comments enable row level security;

-- There are multiple legacy permissive INSERT policies on this table
-- ("Allow insert access to post_comments for authenticated", "ins_post_comments",
-- "insert_own_post_comment"). Postgres OR-combines permissive policies, so ALL
-- of them must be dropped — leaving any one behind would let ungated inserts
-- through and defeat can_comment_on_post(). Consolidate to a single gated policy.
drop policy if exists "Allow insert access to post_comments for authenticated" on public.post_comments;
drop policy if exists ins_post_comments on public.post_comments;
drop policy if exists insert_own_post_comment on public.post_comments;
create policy insert_own_post_comment on public.post_comments
  for insert
  with check (
    auth.role() = 'authenticated'
    and author_user_id = auth.uid()::text
    and public.can_comment_on_post(post_id)
  );


-- ── 4. story_views UPDATE policy (Task 1 story-view RLS fix) ──
-- recordStoryView() and reactToStory() both do
--   upsert(..., { onConflict: 'story_id,viewer_user_id' })
-- which becomes INSERT ... ON CONFLICT DO UPDATE when the viewer already has a
-- row. RLS requires a matching UPDATE policy for that path; there was only an
-- INSERT policy, so re-viewing a story or reacting to an already-viewed story
-- failed the RLS check (swallowed by the client's .catch). This adds the
-- missing self-scoped UPDATE policy so views and reactions persist.
alter table public.story_views enable row level security;

do $$ begin
  create policy update_story_views_viewer on public.story_views
    for update
    using (viewer_user_id = auth.uid()::text)
    with check (viewer_user_id = auth.uid()::text);
exception when duplicate_object then null; end $$;
