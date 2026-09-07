-- ============================================================
-- 20260922 — Fix COMMUNITY_POSTS_GAP_LOG #15: comments_count / likes_count
-- were maintained by client-side writes from communityService, which do not
-- work.
--
-- The gap log frames this as a race condition plus a forgery risk. Verified
-- against the live database, it is neither — it is worse and simpler:
--
--   community_posts' UPDATE policy is `author_user_id = auth.uid()`. A
--   commenter or liker is, by definition, usually NOT the post's author, so
--   their counter UPDATE matches zero rows and is silently discarded (RLS
--   filters the row out; no error is raised, and the service never checks for
--   one). Confirmed empirically: a non-author's update reported ROW_COUNT = 0
--   and the stored count did not move.
--
--   So the counters do not "occasionally lose an increment under concurrency"
--   — they never move at all except when authors comment on or like their own
--   post. The same policy also disproves the forgery claim: a third party
--   cannot write another author's counters at all.
--
-- Fix: maintain both counters in AFTER INSERT/DELETE triggers instead. These
-- are SECURITY DEFINER, so they update the post row regardless of who acted,
-- which is exactly the permission the client call could never have had.
--
-- Recount rather than +1/-1 on purpose: it is self-healing (any drift already
-- in the table is corrected by the next comment or like), idempotent under
-- retries, and cannot drive a counter negative. At neighbourhood post volumes
-- the COUNT(*) is trivial, and both columns are already indexed by post_id.
-- ============================================================

create or replace function public.sync_post_comments_count()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_post text;
begin
  -- NEW is unassigned on DELETE and OLD on INSERT — referencing the wrong one
  -- raises "record is not assigned yet", so branch on TG_OP rather than
  -- coalesce(new, old).
  if TG_OP = 'DELETE' then v_post := old.post_id; else v_post := new.post_id; end if;

  update public.community_posts
     set comments_count = (select count(*) from public.post_comments where post_id = v_post)
   where id = v_post;

  return case when TG_OP = 'DELETE' then old else new end;
end
$$;

create or replace function public.sync_post_likes_count()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_post text;
begin
  if TG_OP = 'DELETE' then v_post := old.post_id; else v_post := new.post_id; end if;

  update public.community_posts
     set likes_count = (select count(*) from public.post_likes where post_id = v_post)
   where id = v_post;

  return case when TG_OP = 'DELETE' then old else new end;
end
$$;

drop trigger if exists trg_sync_post_comments_count on public.post_comments;
create trigger trg_sync_post_comments_count
  after insert or delete on public.post_comments
  for each row execute function public.sync_post_comments_count();

drop trigger if exists trg_sync_post_likes_count on public.post_likes;
create trigger trg_sync_post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.sync_post_likes_count();

-- One-time reconcile of everything the broken client path failed to record.
update public.community_posts p
   set comments_count = (select count(*) from public.post_comments c where c.post_id = p.id),
       likes_count    = (select count(*) from public.post_likes   l where l.post_id = p.id)
 where p.comments_count is distinct from (select count(*) from public.post_comments c where c.post_id = p.id)
    or p.likes_count    is distinct from (select count(*) from public.post_likes   l where l.post_id = p.id);
