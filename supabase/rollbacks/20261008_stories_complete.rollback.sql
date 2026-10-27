-- Rollback of 20261008_stories_complete.sql — restores the policies and function exactly as they were live on
-- 2026-10-25 (read from pg_policies / pg_get_functiondef before the migration was written).
-- Rolling back re-opens: viewers cannot be recorded (story_views upserts fail again), expired stories are readable
-- through the API, blocked people see each other's stories, reports cannot hide a story, nothing purges stories.

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('purge-expired-stories');
  end if;
exception when others then
  raise notice 'pg_cron unschedule skipped: %', sqlerrm;
end
$cron$;

drop policy if exists "User scoped select" on storage.objects;

drop function if exists public.purge_expired_stories();
drop function if exists public.orphan_story_files(integer);

create or replace function public.hide_after_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold integer;
  v_reporters integer;
begin
  if new.target_type not in ('POST', 'COMMENT') or new.reporter_user_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('report-hide:' || new.target_type || ':' || new.target_id));

  select coalesce((select report_hide_threshold from public.moderation_settings where id), 5) into v_threshold;

  select count(distinct reporter_user_id) into v_reporters
  from public.reports
  where target_type = new.target_type
    and target_id = new.target_id
    and reporter_user_id is not null
    and status in ('OPEN', 'REVIEWING');

  if v_reporters >= v_threshold then
    if new.target_type = 'POST' then
      update public.community_posts
        set hidden_at = now(), hidden_reason = 'REPORTS'
        where id = new.target_id and hidden_at is null;
    else
      update public.post_comments
        set hidden_at = now(), hidden_reason = 'REPORTS'
        where id = new.target_id and hidden_at is null;
    end if;
  end if;
  return new;
end
$$;

revoke execute on function public.hide_after_reports() from public, anon, authenticated;

drop table if exists public.story_mutes;

drop policy if exists read_story_views on public.story_views;
drop policy if exists read_story_views_owner on public.story_views;
create policy read_story_views_owner on public.story_views
  for select
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_views.story_id and s.user_id = (select auth.uid())::text
    )
    or exists (
      select 1 from public.users u
      where u.id = (select auth.uid())::text and 'admin' = any (u.roles)
    )
  );

drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories
  for select
  using (
    (
      (visibility = 'everyone' and not coalesce(((select auth.uid())::text = any (hidden_user_ids)), false))
      or (visibility = 'close_friends' and coalesce(((select auth.uid())::text = any (allowed_user_ids)), false))
      or (user_id is not null and user_id = (select auth.uid())::text)
      or ((select auth.uid()) is not null and owner_type = 'business' and public.can_manage_business(owner_id))
    )
    and (
      hidden_at is null
      or user_id = (select auth.uid())::text
      or (owner_type = 'business' and public.can_manage_business(owner_id))
      or (owner_type = 'provider' and exists (
            select 1 from public.providers p
            where p.id = stories.owner_id and p.user_id = (select auth.uid())::text))
      or (select public.is_admin())
    )
  );

alter table public.stories drop constraint if exists stories_expiry_cap;
