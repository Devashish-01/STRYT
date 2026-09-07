-- ============================================================
-- 20260916 — Give admin "Take action" on a report a real moderation effect
-- (flow-completeness audit, workflow 21). Previously it only flipped the
-- report's own status label — the reported content was never actually
-- touched. BUSINESS/PROVIDER reuse the existing suspend toggle already in
-- AdminProfiles (a raw client update — admin's RLS bypass already covers
-- it, confirmed by that screen already working this way). POST and REQUEST
-- had no admin-capable path at all: community_post_delete only allows the
-- post's own author, and requests has no delete RLS policy for anyone.
--
-- POST hard-deletes, mirroring community_post_delete's own existing
-- author-delete behavior exactly (cascading comments/likes/poll_votes) — a
-- post carries no downstream financial/booking chain, so this is already
-- the established, shipped precedent for this content type.
--
-- REQUEST does NOT hard-delete — unlike a post, a request can have
-- proposals and a live agreement chained off it, and this project's own
-- delete_business precedent is explicit that destroying other people's
-- booking/financial history to satisfy one moderation tap is the wrong
-- trade. Sets status = CANCELLED instead (same soft-removal shape,
-- disappears from the OPEN browse feed, nothing referencing it breaks).
-- ============================================================

create or replace function public.admin_delete_post(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  delete from public.post_comments where post_id = p_id;
  delete from public.post_likes where post_id = p_id;
  delete from public.poll_votes where post_id = p_id;
  delete from public.community_posts where id = p_id;
end
$$;

revoke execute on function public.admin_delete_post(text) from public, anon;
grant execute on function public.admin_delete_post(text) to authenticated;

create or replace function public.admin_cancel_request(p_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  update public.requests set status = 'CANCELLED' where id = p_id;
end
$$;

revoke execute on function public.admin_cancel_request(text) from public, anon;
grant execute on function public.admin_cancel_request(text) to authenticated;
