-- ============================================================
-- 20260927 — Four backend gaps from COMMUNITY_POSTS_GAP_LOG, in one migration
-- because they're small and independent: #16, #14, #19, #20.
-- ============================================================

-- ── #16: recommendListing overwrote concurrent recommendations ──────────
-- communityService.recommendListing did a client-side read-modify-write on the
-- `recommendations` JSONB array: SELECT the array, append in JS, UPDATE the
-- whole thing back. Two neighbours recommending at roughly the same time meant
-- the second write clobbered the first — silent data loss, no error.
--
-- Note this also could not have worked for a non-author at all, for the same
-- reason #15's counters didn't: community_posts' UPDATE policy is
-- `author_user_id = auth.uid()`, so a third party's raw UPDATE matched zero
-- rows. Recommending on someone else's post — i.e. the entire point of a
-- RECOMMENDATION post — silently did nothing. SECURITY DEFINER fixes both.
create or replace function public.community_post_add_recommendation(
  p_post_id text, p_listing_type text, p_listing_id text, p_by_name text
) returns public.community_posts
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  text := auth.uid()::text;
  v_post public.community_posts%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_listing_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_LISTING_TYPE'; end if;
  if nullif(trim(coalesce(p_listing_id, '')), '') is null then raise exception 'INVALID_LISTING'; end if;

  -- Row lock: serialises concurrent recommenders, so the append below always
  -- reads the array as it stands after any other in-flight append.
  select * into v_post from public.community_posts where id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;

  update public.community_posts
     set recommendations = coalesce(recommendations, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object(
             'listingType', p_listing_type,
             'listingId',   p_listing_id,
             'byName',      coalesce(nullif(trim(coalesce(p_by_name, '')), ''), 'Someone'),
             'byUserId',    v_uid
           ))
   where id = p_post_id
  returning * into v_post;

  return v_post;
end
$$;

revoke execute on function public.community_post_add_recommendation(text, text, text, text) from public, anon;
grant execute on function public.community_post_add_recommendation(text, text, text, text) to authenticated;


-- ── #14: notify_ended_polls() was never scheduled ───────────────────────
-- The function has existed since 20260896 and its own header says it must be
-- called "from the same schedule that runs close_expired_requests ... or
-- manually". Neither happened: no cron job, and no client caller anywhere. So
-- poll_ended_notified_at was never set on any row and no voter has ever been
-- told a poll they voted in had closed.
--
-- Same finding as workflow 05 in docs/launch/workflows/24_flow_completeness_audit.md
-- — it was logged independently in both places. Fixing it here resolves both.
-- Mirrors 20260918 (close-expired-bulk-deals), which fixed the identical
-- "sweep function with nothing scheduling it" shape.
do $$
begin
  perform cron.schedule('notify-ended-polls', '*/10 * * * *', 'select public.notify_ended_polls();');
exception when others then null;
end $$;


-- ── #19: reacting to a comment never notified its author ────────────────
-- comment_reactions shipped in 20260895 with no notification trigger, unlike
-- post_likes which has notify_on_post_like. Someone's answer being marked
-- helpful is exactly the feedback worth surfacing.
create or replace function public.notify_on_comment_reaction()
returns trigger as $$
declare
  v_comment public.post_comments%rowtype;
begin
  select * into v_comment from public.post_comments where id = new.comment_id;
  if not found or v_comment.author_user_id is null then return new; end if;
  -- Reacting to your own comment is not news.
  if v_comment.author_user_id = new.user_id then return new; end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_comment.author_user_id,
    'COMMUNITY_COMMENT_REACTION',
    new.emoji || ' on your comment',
    'Someone reacted ' || new.emoji || ' to: "' || left(v_comment.body, 60) || '"',
    '/community/' || v_comment.post_id,
    jsonb_build_object('tone', 'brand')
  );
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_comment_reaction on public.comment_reactions;
create trigger trg_notify_comment_reaction
  after insert on public.comment_reactions
  for each row execute function public.notify_on_comment_reaction();


-- ── #20: no admin moderation path for comments ──────────────────────────
-- 20260916 gave admins admin_delete_post for reported posts, but an abusive
-- comment had no equivalent — nothing could remove one. (The entry also
-- expected a target_type check constraint on `reports` needing 'COMMENT'
-- added; there is no such constraint — only reports_status_check — so nothing
-- to widen there. The client-side union in ReportSheet.tsx is the only place
-- that enumerates target types.)
--
-- Deletes the comment's own reactions first for the same reason
-- admin_delete_post clears likes/votes: comment_reactions cascades from
-- post_comments anyway, so this is belt-and-braces and keeps the intent
-- explicit. The comments_count trigger from 20260922 fires on the delete and
-- keeps the post's counter correct.
create or replace function public.admin_delete_comment(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  delete from public.comment_reactions where comment_id = p_id;
  -- Nested replies would otherwise be orphaned behind a removed parent.
  delete from public.post_comments where parent_id = p_id;
  delete from public.post_comments where id = p_id;
end
$$;

revoke execute on function public.admin_delete_comment(text) from public, anon;
grant execute on function public.admin_delete_comment(text) to authenticated;
