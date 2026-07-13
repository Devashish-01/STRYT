-- ============================================================
-- Flow 4 (Community Posts) notifications.
-- Run manually in Supabase SQL editor.
--
-- post_comments has no threading (comments attach to the post only, not to
-- other comments), so "reply" notifications mean: notify the post's author
-- whenever someone else comments on it.
--
-- The `reports` table is shared across target types (POST/BUSINESS/PROVIDER/
-- REQUEST/...); this adds resolution-visibility for ALL of them, not just
-- posts, since the mechanism is identical either way.
-- ============================================================

create or replace function public.notify_on_post_comment()
returns trigger as $$
declare
  post_owner text;
  post_title text;
begin
  select author_user_id, title into post_owner, post_title
    from public.community_posts where id = new.post_id;

  if post_owner is null or post_owner = new.author_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    post_owner,
    'COMMUNITY_COMMENT',
    'New comment on your post',
    coalesce(new.author_name, 'Someone') || ' commented: "' || left(new.body, 60) || '"',
    '/community/' || new.post_id
  );
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_post_comment on public.post_comments;
create trigger trg_notify_post_comment
  after insert on public.post_comments
  for each row execute function public.notify_on_post_comment();

create or replace function public.notify_on_report_resolved()
returns trigger as $$
declare
  deep_link text;
begin
  if new.status not in ('DISMISSED', 'ACTION_TAKEN') then
    return new;
  end if;
  if old.status = new.status then
    return new;
  end if;
  if new.reporter_user_id is null then
    return new;
  end if;

  deep_link := case new.target_type
    when 'POST' then '/community/' || new.target_id
    when 'BUSINESS' then '/business/' || new.target_id
    when 'PROVIDER' then '/provider/' || new.target_id
    when 'REQUEST' then '/request/' || new.target_id
    else null
  end;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    new.reporter_user_id,
    'REPORT_RESOLVED',
    'Your report was reviewed',
    'Your report on "' || coalesce(new.target_name, 'a listing') || '" has been reviewed by our team.',
    deep_link
  );
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_report_resolved on public.reports;
create trigger trg_notify_report_resolved
  after update on public.reports
  for each row execute function public.notify_on_report_resolved();
