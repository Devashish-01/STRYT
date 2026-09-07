-- ============================================================
-- 20260932 — COMMUNITY_POSTS_GAP_LOG #11 (second half): a poll only ever closed
-- when the clock reached poll_ends_at. An author with enough answers, or one
-- who set a week-long window by mistake, had no way to stop it — and a poll
-- created without an end date never closed at all.
--
-- Closing is just "bring poll_ends_at forward to now", not a new state column,
-- so everything already keyed off that timestamp keeps working unchanged:
-- isPollClosed() in the client, the feed's expiry filter, and notify_ended_polls
-- (20260927), which will now send its "poll ended" notification on the next
-- run exactly as it would have for a naturally-expired poll.
--
-- least() rather than a plain assignment: an author closing a poll that already
-- ended must not push its end time FORWARD, which would resurrect it for
-- everyone and re-arm a notification that already went out.
--
-- No reopen counterpart. Voting that stops and restarts makes the tally
-- unreadable — people who saw "closed" and moved on don't come back — so the
-- honest affordance is a one-way close with a confirmation, which is what the
-- UI asks for.
-- ============================================================

create or replace function public.community_poll_close(p_id text)
returns public.community_posts
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_post public.community_posts%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_post from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_post.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;
  if v_post.type is distinct from 'POLL' then raise exception 'NOT_A_POLL'; end if;

  update public.community_posts
     set poll_ends_at = least(coalesce(poll_ends_at, now()), now())
   where id = p_id
  returning * into v_post;

  return v_post;
end
$$;

revoke execute on function public.community_poll_close(text) from public, anon;
grant execute on function public.community_poll_close(text) to authenticated;
