-- ============================================================
-- 20260925 — Fix COMMUNITY_POSTS_GAP_LOG #7 (second half): "Hide from public
-- profile" was a local illusion.
--
-- PublicProfile.tsx wrote hidden post ids to localStorage under
-- "stryt_hidden_posts" on the VIEWER's own device, then filtered the list with
-- `posts.filter(p => !hiddenPosts.includes(p.id))`. Since every other viewer
-- has their own (empty) localStorage, a post an author "hid" stayed fully
-- visible to everyone else — while the UI told the author it was hidden. That
-- is worse than a missing feature: it's a privacy control that reports success
-- and does nothing.
--
-- Deliberately NOT enforced in RLS, unlike the block filter in 20260924. This
-- flag means "don't list this on my profile page", not "nobody may read this".
-- The post stays in the neighbourhood feed, still reachable by direct link,
-- and still owned by its author — putting it in the read policy would silently
-- yank posts out of the feed as well, which is not what the control says it
-- does. Scope is the profile query only.
-- ============================================================

alter table public.community_posts
  add column if not exists show_on_profile boolean not null default true;

-- Author-only toggle. SECURITY DEFINER with an explicit author check rather
-- than relying on the table's UPDATE policy, matching how community_post_update
-- and the other authoring RPCs in 20260837/20260891 are written.
create or replace function public.community_post_set_profile_visibility(
  p_id text, p_show boolean
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

  update public.community_posts
     set show_on_profile = coalesce(p_show, true)
   where id = p_id
  returning * into v_post;

  return v_post;
end
$$;

revoke execute on function public.community_post_set_profile_visibility(text, boolean) from public, anon;
grant execute on function public.community_post_set_profile_visibility(text, boolean) to authenticated;
