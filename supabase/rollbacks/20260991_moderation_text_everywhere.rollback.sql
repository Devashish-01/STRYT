-- Rollback for 20260991_moderation_text_everywhere.sql — apply only after 20260990 is in place (it restores
-- 20260990's versions of the two moderation functions).
--
-- Policies are restored exactly as staging's pg_policies held them before the apply (read 2026-09-19), which is also
-- production's form once 20260989 has wrapped auth.uid() in read_bulk_deals.
--
-- WARNING: every hidden review, request, story and bulk deal becomes visible again (the columns go), hidden reviews
-- count in ratings again, and the automatic check stops covering these tables, businesses and providers.
-- Stored rating averages are not recomputed here: each business's or provider's average picks hidden reviews back
-- up the next time any of its reviews changes.

-- Content-check triggers.
drop trigger if exists trg_content_check_ratings on public.ratings;
drop trigger if exists trg_content_check_requests on public.requests;
drop trigger if exists trg_content_check_stories on public.stories;
drop trigger if exists trg_content_check_bulk_deals on public.bulk_deals;
drop trigger if exists trg_content_check_businesses on public.businesses;
drop trigger if exists trg_content_check_providers on public.providers;

-- Guard triggers on the four tables (the functions belong to 20260990 and stay).
drop trigger if exists trg_guard_moderation_ratings on public.ratings;
drop trigger if exists trg_guard_moderation_requests on public.requests;
drop trigger if exists trg_guard_moderation_stories on public.stories;
drop trigger if exists trg_guard_moderation_bulk_deals on public.bulk_deals;
drop trigger if exists trg_guard_moderation_insert_ratings on public.ratings;
drop trigger if exists trg_guard_moderation_insert_requests on public.requests;
drop trigger if exists trg_guard_moderation_insert_stories on public.stories;
drop trigger if exists trg_guard_moderation_insert_bulk_deals on public.bulk_deals;

-- Policies, as they were.
drop policy if exists read_ratings on public.ratings;
create policy read_ratings on public.ratings for select to public using (true);

drop policy if exists read_requests on public.requests;
create policy read_requests on public.requests for select to public using (true);

drop policy if exists read_bulk_deals on public.bulk_deals;
create policy read_bulk_deals on public.bulk_deals for select to public
  using (((status = 'ACTIVE'::entity_status) OR (owner_user_id = (( SELECT auth.uid() AS uid))::text) OR is_admin()));

drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select to public
  using ((((visibility = 'everyone'::text) AND (NOT COALESCE(((( SELECT auth.uid() AS uid))::text = ANY (hidden_user_ids)), false))) OR ((visibility = 'close_friends'::text) AND COALESCE(((( SELECT auth.uid() AS uid))::text = ANY (allowed_user_ids)), false)) OR ((user_id IS NOT NULL) AND (user_id = (( SELECT auth.uid() AS uid))::text)) OR ((( SELECT auth.uid() AS uid) IS NOT NULL) AND (owner_type = 'business'::text) AND can_manage_business(owner_id))));

-- Ratings count every review again. The function body is re-created first, while hidden_at still exists, and
-- does not reference it.
create or replace function public.recompute_rating_aggregates() returns trigger as $$
declare
  v_type text := coalesce(new.ratee_type, old.ratee_type);
  v_id text := coalesce(new.ratee_id, old.ratee_id);
  v_avg numeric(3,2);
  v_count int;
begin
  select coalesce(round(avg(rating), 2), 0), count(*)
  into v_avg, v_count
  from public.ratings
  where ratee_type = v_type and ratee_id = v_id;

  if v_type = 'BUSINESS' then
    update public.businesses
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  elsif v_type = 'PROVIDER' then
    update public.providers
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  elsif v_type = 'USER' then
    update public.users
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  end if;

  return coalesce(new, old);
end $$ language plpgsql security definer set search_path = public;

-- The moderator's decisions, as 20260990 defined them (posts and comments only).
create or replace function public.admin_moderation_restore(p_target_type text, p_target_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_target_type = 'POST' then
    update public.community_posts set hidden_at = null, hidden_reason = null where id = p_target_id;
  elsif p_target_type = 'COMMENT' then
    update public.post_comments set hidden_at = null, hidden_reason = null where id = p_target_id;
  else
    raise exception 'UNSUPPORTED_TARGET';
  end if;
  update public.reports set status = 'DISMISSED'
    where target_type = p_target_type and target_id = p_target_id and status in ('OPEN', 'REVIEWING');
end
$$;

create or replace function public.admin_moderation_remove(p_target_type text, p_target_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_target_type = 'POST' then
    perform public.admin_delete_post(p_target_id);
  elsif p_target_type = 'COMMENT' then
    perform public.admin_delete_comment(p_target_id);
  else
    raise exception 'UNSUPPORTED_TARGET';
  end if;
  update public.reports set status = 'ACTION_TAKEN'
    where target_type = p_target_type and target_id = p_target_id and status in ('OPEN', 'REVIEWING');
end
$$;

-- Columns on the four tables, and 20260990's two-value reason check on posts and comments.
alter table public.ratings    drop constraint if exists ratings_hidden_reason_check;
alter table public.requests   drop constraint if exists requests_hidden_reason_check;
alter table public.stories    drop constraint if exists stories_hidden_reason_check;
alter table public.bulk_deals drop constraint if exists bulk_deals_hidden_reason_check;
alter table public.ratings    drop column if exists hidden_at, drop column if exists hidden_reason;
alter table public.requests   drop column if exists hidden_at, drop column if exists hidden_reason;
alter table public.stories    drop column if exists hidden_at, drop column if exists hidden_reason;
alter table public.bulk_deals drop column if exists hidden_at, drop column if exists hidden_reason;

alter table public.community_posts drop constraint if exists community_posts_hidden_reason_check;
alter table public.community_posts add constraint community_posts_hidden_reason_check
  check (hidden_reason is null or hidden_reason in ('REPORTS', 'AUTO_CHECK'));
alter table public.post_comments drop constraint if exists post_comments_hidden_reason_check;
alter table public.post_comments add constraint post_comments_hidden_reason_check
  check (hidden_reason is null or hidden_reason in ('REPORTS', 'AUTO_CHECK'));

notify pgrst, 'reload schema';
