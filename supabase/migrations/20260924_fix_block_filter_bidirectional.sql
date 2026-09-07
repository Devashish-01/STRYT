-- ============================================================
-- 20260924 — Corrects 20260923. That migration's block filter only worked in
-- ONE direction, and testing both is what caught it.
--
-- 20260923 inlined the user_blocks lookup into the policy. But user_blocks has
-- its own RLS — read_own_blocks is `blocker_user_id = auth.uid()` — so a
-- viewer can only see block rows THEY created. Result:
--   · "I blocked them"  → I can see my own block row → filtered correctly ✓
--   · "They blocked me" → that row is invisible to me → EXISTS found nothing
--                         → their posts stayed in my feed ✗
-- Measured directly: the block row existed, auth.uid() resolved correctly, and
-- the predicate still evaluated false.
--
-- Fix: delegate to public.is_blocked_between(text) (20260892), which is
-- SECURITY DEFINER — so it sees user_blocks regardless of the caller's RLS —
-- and already checks both orderings. It also takes exactly one free parameter,
-- with auth.uid() as the implicit other side, which is why it exists at all:
-- 20260892's own comment records that the earlier two-free-parameter form was
-- a leak (it let anyone probe whether any two arbitrary users blocked each
-- other). Reusing it keeps that property instead of re-introducing a raw
-- lookup.
--
-- The anon grant below is required, not incidental. /community-hub is a public
-- route, so guests read community_posts, and this policy is now on their read
-- path. Per 20260887's hard-won lesson: when Postgres evaluates an RLS policy
-- whose qual calls a function the querying role cannot EXECUTE, it ABORTS THE
-- WHOLE STATEMENT — the permission resolves at executor init, before any
-- AND/OR short-circuit, so guarding the call behind `auth.uid() is null or …`
-- would NOT have saved it. Without this grant, guest browsing breaks entirely,
-- which is the exact outage 20260887 was written to repair.
--
-- Granting it to anon leaks nothing: is_blocked_between short-circuits to
-- false whenever auth.uid() is null, so for a signed-out caller it returns
-- false for every input and never reads user_blocks at all. Identical
-- reasoning to 20260887 granting is_admin() to anon.
-- ============================================================

grant execute on function public.is_blocked_between(text) to anon;

drop policy if exists "Allow read access to community_posts for all" on public.community_posts;

create policy "Allow read access to community_posts for all"
  on public.community_posts
  for select
  using (
    -- author_user_id null (or no session) → is_blocked_between returns false
    -- → not false → visible. Authors always keep their own posts: user_blocks
    -- has a not-self constraint, so no self-block can exist.
    not public.is_blocked_between(community_posts.author_user_id)
  );
