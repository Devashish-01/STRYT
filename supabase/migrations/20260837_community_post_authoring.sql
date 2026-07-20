-- ============================================================
-- 20260837 — Community post authoring: edit, delete, mark resolved
--
-- community_posts today only ever gets client-side raw .update() calls for
-- likes_count/comments_count/recommendations (no author check — any
-- authenticated user can write those specific counters, which is how
-- like()/addComment()/recommendListing() already work). Author-owned
-- mutations — editing a post, deleting it, marking it resolved — get their
-- own SECURITY DEFINER RPCs instead of adding to that loose raw-write
-- pattern, so they're properly gated to the actual author.
--
-- This is also what makes the `resolved` column usable for the first time —
-- it's rendered as a "Resolved" badge in the UI already, but nothing has
-- ever set it.
--
-- Run manually in the Supabase SQL editor (this repo's established pattern).
-- ============================================================

create or replace function public.community_post_update(
  p_id text, p_title text, p_body text default null, p_image text default null
) returns public.community_posts
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
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'TITLE_REQUIRED'; end if;

  update public.community_posts
     set title = left(trim(p_title), 150),
         body  = nullif(left(trim(coalesce(p_body, '')), 2000), ''),
         image = p_image
   where id = p_id
   returning * into v_post;

  return v_post;
end
$$;

create or replace function public.community_post_delete(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_author text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select author_user_id into v_author from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_author is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;

  delete from public.post_comments where post_id = p_id;
  delete from public.post_likes where post_id = p_id;
  delete from public.poll_votes where post_id = p_id;
  delete from public.community_posts where id = p_id;
end
$$;

create or replace function public.community_post_set_resolved(p_id text, p_resolved boolean)
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

  update public.community_posts set resolved = p_resolved where id = p_id returning * into v_post;
  return v_post;
end
$$;

revoke all on function public.community_post_update(text, text, text, text) from public, anon;
revoke all on function public.community_post_delete(text) from public, anon;
revoke all on function public.community_post_set_resolved(text, boolean) from public, anon;
grant execute on function public.community_post_update(text, text, text, text) to authenticated;
grant execute on function public.community_post_delete(text) to authenticated;
grant execute on function public.community_post_set_resolved(text, boolean) to authenticated;
