-- ============================================================
-- 20260923 — Fix COMMUNITY_POSTS_GAP_LOG #17: a blocked user's posts still
-- appeared in the feed. 20260892 wired blocking into commenting
-- (can_comment_on_post → _user_blocks_exists) but nothing filtered reads, so
-- blocking someone stopped them replying to you while leaving their posts,
-- including ALERTs, in your feed and yours in theirs.
--
-- Fixed in the RLS read policy rather than in the feed RPC, deliberately.
-- communityService.feed() has THREE read paths, not one:
--   1. community_posts_feed          (primary, 20260894)
--   2. community_posts_nearby        (legacy geo fallback, used when the
--                                     primary RPC errors)
--   3. a plain select on community_posts (the non-geo fallback)
-- plus every other reader — post detail, public profiles, author history.
-- Patching only the feed RPC (as this entry's fix direction suggested) would
-- have left paths 2 and 3 as open bypasses. Both RPCs are SECURITY INVOKER
-- (verified: prosecdef = false), so RLS applies inside them too — which makes
-- the read policy the one chokepoint that covers every path at once, now and
-- for any reader added later.
--
-- REPLACING the existing policy, not adding to it: permissive policies are
-- OR'd together, so leaving "(true OR true)" in place alongside a new one
-- would defeat the filter entirely.
--
-- Note the real column names are blocker_user_id / blocked_user_id
-- (20260892:169-176). This entry's suggested SQL used blocker_id/blocked_id,
-- which would not have compiled.
--
-- Bidirectional on purpose: if A blocks B, A stops seeing B AND B stops
-- seeing A — otherwise blocking someone leaves them free to keep watching you.
-- Guests are unaffected: auth.uid() is null, so the EXISTS matches nothing and
-- `not exists` stays true. Authors always keep their own posts — user_blocks
-- has a not-self constraint, so no self-block can exist.
-- ============================================================

drop policy if exists "Allow read access to community_posts for all" on public.community_posts;

create policy "Allow read access to community_posts for all"
  on public.community_posts
  for select
  using (
    not exists (
      select 1
      from public.user_blocks ub
      where (ub.blocker_user_id = (select auth.uid())::text and ub.blocked_user_id = community_posts.author_user_id)
         or (ub.blocker_user_id = community_posts.author_user_id and ub.blocked_user_id = (select auth.uid())::text)
    )
  );
