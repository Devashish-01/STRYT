-- Rollback for 20260990_community_moderation.sql
-- Restores the four policies exactly as production's pg_policies held them on 2026-09-19 (read-only query; the
-- same text as staging before its apply), and drops everything the migration added.
--
-- WARNING: this un-hides every hidden post and comment (the columns go), turns the automatic check off for good,
-- and reopens both identity holes the migration closed: anyone signed in may again file reports as someone else,
-- report the same thing without limit, and publish a community post under another person's name.

-- Triggers first, then the functions they call.
drop trigger if exists trg_hide_after_reports on public.reports;
drop trigger if exists trg_content_check_community_posts on public.community_posts;
drop trigger if exists trg_content_check_post_comments on public.post_comments;
drop trigger if exists trg_guard_moderation_community_posts on public.community_posts;
drop trigger if exists trg_guard_moderation_post_comments on public.post_comments;
drop trigger if exists trg_guard_moderation_insert_community_posts on public.community_posts;
drop trigger if exists trg_guard_moderation_insert_post_comments on public.post_comments;

drop function if exists public.hide_after_reports();
drop function if exists public.request_content_check();
drop function if exists public.guard_moderation_columns();
drop function if exists public.guard_moderation_columns_on_insert();
drop function if exists public.admin_moderation_restore(text, text);
drop function if exists public.admin_moderation_remove(text, text);

-- Policies, as they were.
drop policy if exists ins_reports on public.reports;
create policy ins_reports on public.reports
  for insert to public
  with check ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop policy if exists "Allow insert access to community_posts for authenticated" on public.community_posts;
create policy "Allow insert access to community_posts for authenticated" on public.community_posts
  for insert to public
  with check (((( SELECT auth.role() AS role) = 'authenticated'::text) OR (author_user_id = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "Allow read access to community_posts for all" on public.community_posts;
create policy "Allow read access to community_posts for all" on public.community_posts
  for select to public
  using ((NOT is_blocked_between(author_user_id)));

drop policy if exists "Allow read access to post_comments for all" on public.post_comments;
create policy "Allow read access to post_comments for all" on public.post_comments
  for select to public
  using ((true OR true));

-- Indexes, columns and the settings table.
drop index if exists public.reports_one_open_per_reporter;
drop index if exists public.reports_target_idx;

alter table public.community_posts drop constraint if exists community_posts_hidden_reason_check;
alter table public.post_comments drop constraint if exists post_comments_hidden_reason_check;
alter table public.community_posts drop column if exists hidden_at, drop column if exists hidden_reason;
alter table public.post_comments drop column if exists hidden_at, drop column if exists hidden_reason;

drop table if exists public.moderation_settings;

notify pgrst, 'reload schema';
