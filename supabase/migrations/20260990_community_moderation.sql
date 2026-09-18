-- Community moderation: posts and comments hide themselves after five different people report them, and every
-- new or edited post and comment can be checked automatically. A moderator then removes it or restores it.
-- Owner decisions, 18 Sept 2026: a threshold of 5 distinct reporters; option (b), "show at once, check alongside,
-- hide if it fails".
--
-- Both depend on knowing who did something, and two holes let anyone fake that. They are closed first:
--   * `reports` accepted any `reporter_user_id` (its insert policy only asked "is the caller signed in?"), and the
--     same person could report the same thing any number of times — one person could have hidden any post alone;
--   * `community_posts` inserts were allowed when the caller was signed in OR was the author, so any signed-in
--     user could publish a post under someone else's name. The app always inserts as the caller, so requiring
--     both breaks nothing it does.
--
-- Hiding is enforced by row-level security, so it covers every read path at once: the feed
-- (`community_posts_feed`) and `community_posts_nearby` are SECURITY INVOKER, and PostgREST reads go through the
-- policies. A hidden row stays visible to its author (who sees "under review") and to admins.
--
-- The automatic check is off until an admin turns it on (`moderation_settings.content_check_enabled`). It calls
-- the `moderation` edge function through pg_net with the same vault secrets the push trigger uses
-- (`functions_url`, `service_role_key`), so nothing new has to be stored in the database.

-- ── 1. Reports are filed as yourself, and once per open report ────────────────────────────────────────────────
drop policy if exists ins_reports on public.reports;
create policy ins_reports on public.reports
  for insert to authenticated
  with check (reporter_user_id = (select auth.uid())::text);

-- A repeat report of something already under review is a duplicate, not a second voice. Once a report is closed,
-- the same person may report the same thing again.
create unique index if not exists reports_one_open_per_reporter
  on public.reports (reporter_user_id, target_type, target_id)
  where reporter_user_id is not null and status in ('OPEN', 'REVIEWING');

create index if not exists reports_target_idx on public.reports (target_type, target_id);

-- ── 2. Community posts are created as yourself ────────────────────────────────────────────────────────────────
drop policy if exists "Allow insert access to community_posts for authenticated" on public.community_posts;
create policy "Allow insert access to community_posts for authenticated" on public.community_posts
  for insert
  with check (
    (select auth.role()) = 'authenticated'
    and author_user_id = (select auth.uid())::text
  );

-- ── 3. Settings: one row, read by the triggers below ─────────────────────────────────────────────────────────
create table if not exists public.moderation_settings (
  id boolean primary key default true check (id),
  -- How many different people must report a post or comment before it hides itself.
  report_hide_threshold integer not null default 5 check (report_hide_threshold between 2 and 100),
  -- Send every new or edited post and comment to the automatic check. Off until an admin turns it on, because
  -- it needs the moderation function deployed with its TYPESAFE_API_KEY secret.
  content_check_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.moderation_settings (id) values (true) on conflict (id) do nothing;

alter table public.moderation_settings enable row level security;
drop policy if exists moderation_settings_admin_read on public.moderation_settings;
create policy moderation_settings_admin_read on public.moderation_settings
  for select to authenticated using ((select public.is_admin()));
drop policy if exists moderation_settings_admin_update on public.moderation_settings;
create policy moderation_settings_admin_update on public.moderation_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.moderation_settings from anon;

-- ── 4. Hidden state ───────────────────────────────────────────────────────────────────────────────────────────
alter table public.community_posts
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;
alter table public.post_comments
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_posts_hidden_reason_check') then
    alter table public.community_posts add constraint community_posts_hidden_reason_check
      check (hidden_reason is null or hidden_reason in ('REPORTS', 'AUTO_CHECK'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'post_comments_hidden_reason_check') then
    alter table public.post_comments add constraint post_comments_hidden_reason_check
      check (hidden_reason is null or hidden_reason in ('REPORTS', 'AUTO_CHECK'));
  end if;
end $$;

-- Authors own their rows, and the owner policies let them update any column — including these. Only moderation
-- code may change them: SECURITY DEFINER functions (current_user is their owner) and the service role. A direct
-- API call runs as `authenticated` and is refused.
create or replace function public.guard_moderation_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.hidden_at is distinct from old.hidden_at or new.hidden_reason is distinct from old.hidden_reason)
     and current_user in ('authenticated', 'anon') then
    raise exception 'MODERATION_FIELDS_READ_ONLY' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_moderation_community_posts on public.community_posts;
create trigger trg_guard_moderation_community_posts
  before update of hidden_at, hidden_reason on public.community_posts
  for each row execute function public.guard_moderation_columns();

drop trigger if exists trg_guard_moderation_post_comments on public.post_comments;
create trigger trg_guard_moderation_post_comments
  before update of hidden_at, hidden_reason on public.post_comments
  for each row execute function public.guard_moderation_columns();

-- And nobody may create a row that arrives already hidden or marked.
create or replace function public.guard_moderation_columns_on_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.hidden_at is not null or new.hidden_reason is not null) and current_user in ('authenticated', 'anon') then
    raise exception 'MODERATION_FIELDS_READ_ONLY' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_moderation_insert_community_posts on public.community_posts;
create trigger trg_guard_moderation_insert_community_posts
  before insert on public.community_posts
  for each row execute function public.guard_moderation_columns_on_insert();

drop trigger if exists trg_guard_moderation_insert_post_comments on public.post_comments;
create trigger trg_guard_moderation_insert_post_comments
  before insert on public.post_comments
  for each row execute function public.guard_moderation_columns_on_insert();

-- Trigger functions only; nobody calls them directly.
revoke all on function public.guard_moderation_columns() from public, anon, authenticated;
revoke all on function public.guard_moderation_columns_on_insert() from public, anon, authenticated;

-- ── 5. Hidden rows are visible to their author and to admins only ────────────────────────────────────────────
drop policy if exists "Allow read access to community_posts for all" on public.community_posts;
create policy "Allow read access to community_posts for all" on public.community_posts
  for select
  using (
    not public.is_blocked_between(author_user_id)
    and (
      hidden_at is null
      or author_user_id = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

drop policy if exists "Allow read access to post_comments for all" on public.post_comments;
create policy "Allow read access to post_comments for all" on public.post_comments
  for select
  using (
    hidden_at is null
    or author_user_id = (select auth.uid())::text
    or (select public.is_admin())
  );

-- ── 6. Enough different reporters: hide it ───────────────────────────────────────────────────────────────────
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

  -- Serialise the count per target. Two reports arriving together would otherwise each count the other as not yet
  -- there, and a post with five reporters could stay up until a sixth.
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

drop trigger if exists trg_hide_after_reports on public.reports;
create trigger trg_hide_after_reports
  after insert on public.reports
  for each row execute function public.hide_after_reports();

revoke execute on function public.hide_after_reports() from public, anon, authenticated;

-- ── 7. Automatic check: queue every new or edited post and comment for the moderation function ───────────────
create or replace function public.request_content_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  if not coalesce((select content_check_enabled from public.moderation_settings where id), false) then
    return new;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/moderation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- apikey only: the secret key is not a JWT (see 20260883).
      'apikey',       v_key
    ),
    body    := jsonb_build_object('action', 'check_content', 'targetType', tg_argv[0], 'targetId', new.id)
  );
  return new;
exception
  -- A failed check must never block someone from posting.
  when others then
    return new;
end
$$;

drop trigger if exists trg_content_check_community_posts on public.community_posts;
create trigger trg_content_check_community_posts
  after insert or update of title, body on public.community_posts
  for each row execute function public.request_content_check('POST');

drop trigger if exists trg_content_check_post_comments on public.post_comments;
create trigger trg_content_check_post_comments
  after insert or update of body on public.post_comments
  for each row execute function public.request_content_check('COMMENT');

revoke execute on function public.request_content_check() from public, anon, authenticated;

-- ── 8. The moderator's two decisions ─────────────────────────────────────────────────────────────────────────
-- Restore: visible again, and every open report on it is closed as reviewed.
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

-- Remove: deleted through the existing admin paths (which also clear a comment's replies and reactions), and
-- every open report on it is closed as actioned.
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

revoke execute on function public.admin_moderation_restore(text, text) from public, anon;
revoke execute on function public.admin_moderation_remove(text, text) from public, anon;
grant execute on function public.admin_moderation_restore(text, text) to authenticated;
grant execute on function public.admin_moderation_remove(text, text) to authenticated;

notify pgrst, 'reload schema';
