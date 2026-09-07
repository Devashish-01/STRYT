-- ============================================================
-- 20260930 — COMMUNITY_POSTS_GAP_LOG #6: a post's rich per-type fields and its
-- audience settings were write-once. The composer collects `last_seen`,
-- `reward`, `pickup_note`, `tagged_listing`, `comment_policy` and
-- `hide_like_count` at creation, but community_post_update (20260891) only ever
-- took (p_id, p_title, p_body, p_image, p_media, p_image_alt) — so an author
-- could fix a typo in the title and nothing else. Notably they could not close
-- comments on a thread that had turned nasty, which is the one of these that
-- actually matters.
--
-- `create or replace` cannot add parameters, so the old function is dropped and
-- recreated. Every new parameter has a DEFAULT, so the existing 4- and
-- 6-argument calls from older app builds / OTA bundles keep resolving to this
-- one function — PostgREST matches on the named keys in the request body, not
-- on arity.
--
-- NULL vs '' is load-bearing on the text parameters:
--   NULL ("the caller didn't mention this field") → leave the column alone.
--   ''   ("the caller sent an empty box")         → clear the column.
-- That's what lets an old client, which sends none of these, keep working
-- untouched while the new edit sheet can still empty a reward it once set.
--
-- tagged_listing needs a separate p_clear_tagged_listing flag rather than the
-- same NULL/empty trick: PostgREST collapses a JSON null in the request body to
-- SQL NULL, so "untag this post" and "don't mention tagged_listing" would
-- arrive here as the identical value and untagging would silently no-op.
--
-- The function does NOT police which fields make sense for which post type —
-- the sheet only offers the relevant ones, and a stray pickup_note on a poll is
-- inert data nothing reads, not a correctness problem. What it does police is
-- comment_policy, because an invalid value there would hit the table's CHECK
-- constraint and surface as an opaque 23514 instead of a clear reason.
-- ============================================================

drop function if exists public.community_post_update(text, text, text, text, text[], text);
drop function if exists public.community_post_update(text, text, text, text, text[], text, text, text, text, jsonb, text, boolean);

create function public.community_post_update(
  p_id text,
  p_title text,
  p_body text default null,
  p_image text default null,
  p_media text[] default null,
  p_image_alt text default null,
  p_last_seen text default null,
  p_reward text default null,
  p_pickup_note text default null,
  p_tagged_listing jsonb default null,
  p_clear_tagged_listing boolean default false,
  p_comment_policy text default null,
  p_hide_like_count boolean default null
)
returns public.community_posts
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_post public.community_posts%rowtype;
  v_media text[];
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_post from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_post.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'TITLE_REQUIRED'; end if;

  if p_comment_policy is not null
     and p_comment_policy not in ('EVERYONE', 'NEIGHBORS', 'MUTUALS', 'OFF') then
    raise exception 'INVALID_COMMENT_POLICY';
  end if;

  -- p_media null = "caller didn't say", so fall back to the single p_image it
  -- did send (that's the pre-media client, still shipping in an older app
  -- build / OTA bundle). An explicitly empty array means "remove the photos".
  v_media := coalesce(
    p_media,
    case when nullif(p_image, '') is null then '{}'::text[] else array[p_image] end
  );
  if coalesce(array_length(v_media, 1), 0) > 4 then
    raise exception 'TOO_MANY_PHOTOS';
  end if;

  update public.community_posts
     set title     = left(trim(p_title), 150),
         body      = nullif(left(trim(coalesce(p_body, '')), 2000), ''),
         media     = v_media,
         -- image stays the first photo so older read paths keep working.
         image     = v_media[1],
         image_alt = nullif(trim(coalesce(p_image_alt, '')), ''),

         last_seen = case when p_last_seen is null then last_seen
                          else nullif(left(trim(p_last_seen), 120), '') end,
         reward    = case when p_reward is null then reward
                          else nullif(left(trim(p_reward), 80), '') end,
         pickup_note = case when p_pickup_note is null then pickup_note
                            else nullif(left(trim(p_pickup_note), 140), '') end,
         -- The flag is the explicit "untag it"; a NULL payload without it just
         -- means the caller never mentioned the field.
         tagged_listing = case
                            when coalesce(p_clear_tagged_listing, false) then null
                            when p_tagged_listing is null then tagged_listing
                            when jsonb_typeof(p_tagged_listing) = 'null' then null
                            else p_tagged_listing
                          end,
         comment_policy = coalesce(p_comment_policy, comment_policy),
         -- allow_comments is the legacy mirror resolveCommentPolicy() falls
         -- back to. Kept consistent here so a post edited to OFF doesn't read
         -- as "on" to any path still looking at the boolean.
         allow_comments = case
                            when p_comment_policy is null then allow_comments
                            when p_comment_policy = 'OFF' then false
                            else true
                          end,
         hide_like_count = coalesce(p_hide_like_count, hide_like_count)
   where id = p_id
   returning * into v_post;

  return v_post;
end
$$;

revoke execute on function public.community_post_update(text, text, text, text, text[], text, text, text, text, jsonb, boolean, text, boolean) from public, anon;
grant execute on function public.community_post_update(text, text, text, text, text[], text, text, text, text, jsonb, boolean, text, boolean) to authenticated;
