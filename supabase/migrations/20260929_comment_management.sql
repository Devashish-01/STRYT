-- ============================================================
-- 20260929 — COMMUNITY_POSTS_GAP_LOG #4: comments had no management actions
-- at all. A commenter couldn't remove their own comment, a post author
-- couldn't remove spam or abuse from under their own post, nobody could pin a
-- helpful answer, and nothing could be reported (the reporting half of #20).
--
-- post_comments has no pinned/edited columns, so both are added here.
-- ============================================================

alter table public.post_comments
  add column if not exists pinned_at timestamptz,
  add column if not exists edited_at timestamptz;

-- Ordering: pinned first, then oldest-first as the thread already reads.
create index if not exists post_comments_post_pinned_idx
  on public.post_comments (post_id, pinned_at desc nulls last, created_at);


-- ── Delete: the comment's author OR the post's author ──────────────────
-- Two legitimate deleters, for different reasons: your own words are yours to
-- retract, and your own post is yours to keep clean. Admins go through
-- admin_delete_comment (20260927) instead, which doesn't require either
-- relationship.
create or replace function public.community_comment_delete(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_comment public.post_comments%rowtype;
  v_post_author text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_comment from public.post_comments where id = p_id;
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;

  select author_user_id into v_post_author from public.community_posts where id = v_comment.post_id;

  if v_comment.author_user_id is distinct from v_uid
     and v_post_author is distinct from v_uid then
    raise exception 'NOT_ALLOWED';
  end if;

  -- Replies would otherwise dangle under a parent that no longer exists.
  delete from public.comment_reactions where comment_id = p_id;
  delete from public.post_comments where parent_id = p_id;
  delete from public.post_comments where id = p_id;
  -- comments_count is corrected by trg_sync_post_comments_count (20260922).
end
$$;

revoke execute on function public.community_comment_delete(text) from public, anon;
grant execute on function public.community_comment_delete(text) to authenticated;


-- ── Edit: author only, body only ───────────────────────────────────────
-- Body only on purpose. Re-running mention extraction on an edit would let
-- someone edit a benign comment into one that @-pings half the street after
-- the fact, so mentions stay as posted. edited_at marks it so a silently
-- rewritten comment is visible as edited.
create or replace function public.community_comment_update(p_id text, p_body text)
returns public.post_comments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_comment public.post_comments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'EMPTY_BODY'; end if;

  select * into v_comment from public.post_comments where id = p_id for update;
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;
  if v_comment.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_COMMENT'; end if;

  update public.post_comments
     set body = left(trim(p_body), 2000), edited_at = now()
   where id = p_id
  returning * into v_comment;

  return v_comment;
end
$$;

revoke execute on function public.community_comment_update(text, text) from public, anon;
grant execute on function public.community_comment_update(text, text) to authenticated;


-- ── Pin: post author only, one pinned comment per post ─────────────────
-- "Accepted answer" for a question thread. Single-pin: clearing the others
-- first means the caller can't end up with two pinned comments racing for the
-- top slot, and the UI never has to decide which of several pins wins.
create or replace function public.community_comment_set_pinned(p_id text, p_pinned boolean)
returns public.post_comments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_comment public.post_comments%rowtype;
  v_post_author text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_comment from public.post_comments where id = p_id;
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;

  select author_user_id into v_post_author from public.community_posts where id = v_comment.post_id;
  if v_post_author is distinct from v_uid then raise exception 'NOT_POST_AUTHOR'; end if;

  if coalesce(p_pinned, false) then
    update public.post_comments set pinned_at = null
     where post_id = v_comment.post_id and pinned_at is not null;
    update public.post_comments set pinned_at = now() where id = p_id returning * into v_comment;
  else
    update public.post_comments set pinned_at = null where id = p_id returning * into v_comment;
  end if;

  return v_comment;
end
$$;

revoke execute on function public.community_comment_set_pinned(text, boolean) from public, anon;
grant execute on function public.community_comment_set_pinned(text, boolean) to authenticated;
