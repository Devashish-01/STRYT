-- Moderation, part two: the automatic check covers every public place people write, not just community posts and
-- comments. Owner decision, 19 Sept 2026: "every place someone writes, except messages".
--
-- Hidden, and filed for a moderator, when the check clearly fails (the same rules as 20260990):
--   reviews (ratings.comment), requests (title, description), story captions, bulk deals (title, description).
-- Filed for a moderator but never hidden automatically — hiding a whole shop or profile is a moderator's call, and
-- the existing Suspend action does it:
--   business listings (name, description) and provider profiles (display name, bio).
-- Not checked: proposal messages and chat. They are private between two people, like messages.
--
-- Hidden rows stay visible to their author and to admins, by RLS, exactly as in 20260990; only moderation code can
-- set or clear the hidden state. A hidden review stops counting in the business's or provider's rating.
--
-- "Remove" per type: a story is deleted (stories are short-lived anyway); a request is closed through
-- admin_cancel_request and stays hidden; a review or bulk deal stays hidden for good, reason REMOVED, because a
-- review feeds the ratings and a deal can carry pledges and deposits that must not vanish.
--
-- The report-threshold hide (D20) stays limited to posts and comments.

-- ── 1. Hidden state on four more tables, and a REMOVED reason on all six ──────────────────────────────────────
alter table public.ratings    add column if not exists hidden_at timestamptz, add column if not exists hidden_reason text;
alter table public.requests   add column if not exists hidden_at timestamptz, add column if not exists hidden_reason text;
alter table public.stories    add column if not exists hidden_at timestamptz, add column if not exists hidden_reason text;
alter table public.bulk_deals add column if not exists hidden_at timestamptz, add column if not exists hidden_reason text;

do $$
declare
  t text;
begin
  foreach t in array array['community_posts', 'post_comments', 'ratings', 'requests', 'stories', 'bulk_deals'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_hidden_reason_check');
    execute format(
      'alter table public.%I add constraint %I check (hidden_reason is null or hidden_reason in (''REPORTS'', ''AUTO_CHECK'', ''REMOVED''))',
      t, t || '_hidden_reason_check');
  end loop;
end $$;

-- ── 2. Only moderation code may set or clear it (the guards from 20260990) ───────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['ratings', 'requests', 'stories', 'bulk_deals'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_guard_moderation_' || t, t);
    execute format(
      'create trigger %I before update of hidden_at, hidden_reason on public.%I for each row execute function public.guard_moderation_columns()',
      'trg_guard_moderation_' || t, t);
    execute format('drop trigger if exists %I on public.%I', 'trg_guard_moderation_insert_' || t, t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.guard_moderation_columns_on_insert()',
      'trg_guard_moderation_insert_' || t, t);
  end loop;
end $$;

-- ── 3. Hidden rows: their author and admins only ─────────────────────────────────────────────────────────────
drop policy if exists read_ratings on public.ratings;
create policy read_ratings on public.ratings
  for select
  using (
    hidden_at is null
    or rater_user_id = (select auth.uid())::text
    or (select public.is_admin())
  );

drop policy if exists read_requests on public.requests;
create policy read_requests on public.requests
  for select
  using (
    hidden_at is null
    or requester_user_id = (select auth.uid())::text
    or (select public.is_admin())
  );

-- Bulk deals: owners, catalog staff and admins also read through write_bulk_deals (FOR ALL), which is unchanged.
drop policy if exists read_bulk_deals on public.bulk_deals;
create policy read_bulk_deals on public.bulk_deals
  for select
  using (
    (status = 'ACTIVE'::entity_status and hidden_at is null)
    or owner_user_id = (select auth.uid())::text
    or public.is_admin()
  );

-- Stories: the existing audience rules, unchanged, and additionally not hidden unless you own it or are an admin.
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories
  for select
  using (
    (
      ((visibility = 'everyone'::text) and (not coalesce((((select auth.uid()))::text = any (hidden_user_ids)), false)))
      or ((visibility = 'close_friends'::text) and coalesce((((select auth.uid()))::text = any (allowed_user_ids)), false))
      or ((user_id is not null) and (user_id = ((select auth.uid()))::text))
      or (((select auth.uid()) is not null) and (owner_type = 'business'::text) and public.can_manage_business(owner_id))
    )
    and (
      hidden_at is null
      or user_id = ((select auth.uid()))::text
      or ((owner_type = 'business'::text) and public.can_manage_business(owner_id))
      or ((owner_type = 'provider'::text) and exists (
            select 1 from public.providers p where p.id = stories.owner_id and p.user_id = ((select auth.uid()))::text))
      or (select public.is_admin())
    )
  );

-- ── 4. A hidden review does not count in the rating it would otherwise move ──────────────────────────────────
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
  where ratee_type = v_type and ratee_id = v_id and hidden_at is null;

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

-- ── 5. The automatic check, on every public text field ───────────────────────────────────────────────────────
-- request_content_check (20260990) queues { targetType: TG_ARGV[0], targetId: new.id } while the check is on.
drop trigger if exists trg_content_check_ratings on public.ratings;
create trigger trg_content_check_ratings
  after insert or update of comment on public.ratings
  for each row when (coalesce(new.comment, '') <> '')
  execute function public.request_content_check('RATING');

drop trigger if exists trg_content_check_requests on public.requests;
create trigger trg_content_check_requests
  after insert or update of title, description on public.requests
  for each row execute function public.request_content_check('REQUEST');

drop trigger if exists trg_content_check_stories on public.stories;
create trigger trg_content_check_stories
  after insert or update of caption on public.stories
  for each row when (coalesce(new.caption, '') <> '')
  execute function public.request_content_check('STORY');

drop trigger if exists trg_content_check_bulk_deals on public.bulk_deals;
create trigger trg_content_check_bulk_deals
  after insert or update of title, description on public.bulk_deals
  for each row execute function public.request_content_check('BULK_DEAL');

drop trigger if exists trg_content_check_businesses on public.businesses;
create trigger trg_content_check_businesses
  after insert or update of name, description on public.businesses
  for each row execute function public.request_content_check('BUSINESS');

drop trigger if exists trg_content_check_providers on public.providers;
create trigger trg_content_check_providers
  after insert or update of display_name, bio on public.providers
  for each row execute function public.request_content_check('PROVIDER');

-- ── 6. The moderator's decisions, for every hideable type ────────────────────────────────────────────────────
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
  case p_target_type
    when 'POST'      then update public.community_posts set hidden_at = null, hidden_reason = null where id = p_target_id;
    when 'COMMENT'   then update public.post_comments   set hidden_at = null, hidden_reason = null where id = p_target_id;
    when 'RATING'    then update public.ratings         set hidden_at = null, hidden_reason = null where id = p_target_id;
    when 'REQUEST'   then update public.requests        set hidden_at = null, hidden_reason = null where id = p_target_id;
    when 'STORY'     then update public.stories         set hidden_at = null, hidden_reason = null where id = p_target_id;
    when 'BULK_DEAL' then update public.bulk_deals      set hidden_at = null, hidden_reason = null where id = p_target_id;
    else raise exception 'UNSUPPORTED_TARGET';
  end case;
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
  case p_target_type
    when 'POST'    then perform public.admin_delete_post(p_target_id);
    when 'COMMENT' then perform public.admin_delete_comment(p_target_id);
    when 'STORY'   then delete from public.stories where id = p_target_id;
    when 'REQUEST' then
      perform public.admin_cancel_request(p_target_id);
      update public.requests set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'REMOVED' where id = p_target_id;
    when 'RATING' then
      update public.ratings set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'REMOVED' where id = p_target_id;
    when 'BULK_DEAL' then
      update public.bulk_deals set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'REMOVED' where id = p_target_id;
    else raise exception 'UNSUPPORTED_TARGET';
  end case;
  update public.reports set status = 'ACTION_TAKEN'
    where target_type = p_target_type and target_id = p_target_id and status in ('OPEN', 'REVIEWING');
end
$$;

revoke execute on function public.admin_moderation_restore(text, text) from public, anon;
revoke execute on function public.admin_moderation_remove(text, text) from public, anon;
grant execute on function public.admin_moderation_restore(text, text) to authenticated;
grant execute on function public.admin_moderation_remove(text, text) to authenticated;
revoke all on function public.recompute_rating_aggregates() from public, anon, authenticated;

notify pgrst, 'reload schema';
