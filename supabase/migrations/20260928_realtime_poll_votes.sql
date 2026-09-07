-- ============================================================
-- 20260928 — Add poll_votes to the supabase_realtime publication.
--
-- Required by COMMUNITY_POSTS_GAP_LOG #18's second half: poll results are
-- counted out of poll_votes inside communityService.get, not stored on
-- community_posts, so casting a vote changes no row the post screen was
-- watching and the result bars stayed frozen for everyone else with the thread
-- open. CommunityPostDetail now subscribes to poll_votes for its own post.
--
-- Without this line that subscription is inert — it would attach, deliver
-- nothing, and only surface as the "check the supabase_realtime publication
-- for this table" console warning the realtime helpers already log. Caught by
-- checking pg_publication_tables rather than assuming: community_posts,
-- post_comments and comment_reactions were all already in the publication,
-- poll_votes was the one that wasn't.
--
-- No REPLICA IDENTITY change needed: the subscriber only triggers a refetch
-- and never reads payload columns, so the default (primary key on DELETE) is
-- sufficient.
-- ============================================================

do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception
  -- Already a member, or the publication isn't managed here — either way this
  -- migration has nothing left to do.
  when duplicate_object then null;
  when undefined_object then null;
end $$;
