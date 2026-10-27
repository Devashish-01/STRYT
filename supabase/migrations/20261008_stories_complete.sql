-- ============================================================
-- 20261008 — Stories, completed (see archive/docs/gaps/STORIES_GAP_LOG.md)
--
-- 1. A viewer can read their own view row. Without this NOTHING about views or reactions has ever worked:
--    `INSERT … ON CONFLICT DO UPDATE` (what the app sends) must be able to see the row it touches, and the only
--    SELECT policy on story_views was "the story's author". Measured on production in a rolled-back test:
--    first upsert 42501, ON CONFLICT DO NOTHING 42501, UPDATE of own reaction 0 rows, plain INSERT fine.
--    Result: 0 views and 0 reactions ever recorded. The author's team (business managers, provider owner)
--    can read views too — before, only the exact person who posted could.
-- 2. stories_select: expired stories are readable only by their owner/managers, or when saved as a Highlight
--    (the Retention Policy and Terms §18.6 say expired stories are removed); and nobody sees a story from
--    someone they have a block with, in either direction (is_blocked_between, same helper community posts use).
-- 3. Lifetime cap: expires_at may not be more than 7 days after posting (+1 h of clock-skew slack — the app
--    computes expires_at on the device). NOT VALID: checks every new/changed row, skips history (there is none).
-- 4. story_mutes: "see fewer stories from this person/shop" — private to the muter.
-- 5. hide_after_reports() now also covers STORY (same 5-reporter threshold from moderation_settings).
-- 6. purge_expired_stories() + a daily pg_cron job. Keeps highlights and anything with an open report.
--    (Photos are removed by the purge-expired-stories edge function; this only deletes rows.)
-- 7. orphan_story_files(): the story photos in storage that no story row points to any more — what the edge
--    function sweeps. Service role only.
-- 8. A user can see (and so delete) their OWN files in the uploads bucket. Storage deletes with
--    DELETE … RETURNING, and RETURNING needs a SELECT policy; there was none, so `storage.remove()` has always
--    returned success while removing nothing — measured: a story photo deleted by its owner was still in the
--    bucket. The existing DELETE policy was already scoped to the user's own folder; this mirrors it.
-- ============================================================

-- ── 3. Lifetime cap ──────────────────────────────────────────
alter table public.stories drop constraint if exists stories_expiry_cap;
alter table public.stories
  add constraint stories_expiry_cap
  check (expires_at <= coalesce(created_at, now()) + interval '7 days 1 hour') not valid;

-- ── 2. Who can read a story ──────────────────────────────────
-- Same audience rules as 20260971 (everyone minus hidden_user_ids / close friends / the poster / business
-- managers) and the same moderation rule (hidden stories: the poster, managers, the provider owner, admins),
-- with the two new terms marked NEW.
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories
  for select
  using (
    (
      (
        (visibility = 'everyone' and not coalesce(((select auth.uid())::text = any (hidden_user_ids)), false))
        or (visibility = 'close_friends' and coalesce(((select auth.uid())::text = any (allowed_user_ids)), false))
        or (user_id is not null and user_id = (select auth.uid())::text)
        or ((select auth.uid()) is not null and owner_type = 'business' and public.can_manage_business(owner_id))
      )
      -- NEW: an expired story is only for its owner/managers — unless it was saved as a Highlight.
      and (
        expires_at > now()
        or is_highlighted
        or (user_id is not null and user_id = (select auth.uid())::text)
        or ((select auth.uid()) is not null and owner_type = 'business' and public.can_manage_business(owner_id))
        or (owner_type = 'provider' and exists (
              select 1 from public.providers p
              where p.id = stories.owner_id and p.user_id = (select auth.uid())::text))
      )
      -- NEW: no story between two people who have blocked each other (either direction). The poster always
      -- sees their own; is_blocked_between answers false for a guest, so signed-out browsing is unchanged.
      and (
        user_id is null
        or user_id = (select auth.uid())::text
        or not public.is_blocked_between(user_id)
      )
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

-- ── 1. Who can read story views ──────────────────────────────
drop policy if exists read_story_views_owner on public.story_views;
drop policy if exists read_story_views on public.story_views;
create policy read_story_views on public.story_views
  for select
  using (
    viewer_user_id = (select auth.uid())::text
    or exists (
      select 1 from public.stories s
      where s.id = story_views.story_id
        and (
          s.user_id = (select auth.uid())::text
          or (s.owner_type = 'business' and public.can_manage_business(s.owner_id))
          or (s.owner_type = 'provider' and exists (
                select 1 from public.providers p
                where p.id = s.owner_id and p.user_id = (select auth.uid())::text))
        )
    )
    or exists (
      select 1 from public.users u
      where u.id = (select auth.uid())::text and 'admin' = any (u.roles)
    )
  );

-- ── 4. Mutes ─────────────────────────────────────────────────
create table if not exists public.story_mutes (
  user_id    text not null references public.users(id) on delete cascade,
  owner_type text not null check (owner_type in ('user', 'business', 'provider')),
  owner_id   text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, owner_type, owner_id)
);

alter table public.story_mutes enable row level security;

drop policy if exists story_mutes_select_own on public.story_mutes;
create policy story_mutes_select_own on public.story_mutes
  for select to authenticated using (user_id = (select auth.uid())::text);

drop policy if exists story_mutes_insert_own on public.story_mutes;
create policy story_mutes_insert_own on public.story_mutes
  for insert to authenticated with check (user_id = (select auth.uid())::text);

drop policy if exists story_mutes_delete_own on public.story_mutes;
create policy story_mutes_delete_own on public.story_mutes
  for delete to authenticated using (user_id = (select auth.uid())::text);

revoke all on public.story_mutes from anon;
grant select, insert, delete on public.story_mutes to authenticated;

-- ── 5. Reports hide a story too ──────────────────────────────
-- Identical to the live function (20260990) plus the STORY branch.
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
  if new.target_type not in ('POST', 'COMMENT', 'STORY') or new.reporter_user_id is null then
    return new;
  end if;

  -- Serialise the count per target. Two reports arriving together would otherwise each count the other as not yet
  -- there, and a story with five reporters could stay up until a sixth.
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
    elsif new.target_type = 'STORY' then
      update public.stories
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

-- ── 6. Daily removal of expired stories ──────────────────────
-- Keeps: Highlights, and any story with a report still open (a moderator must be able to look at it).
-- story_views rows go with the story (ON DELETE CASCADE). One hour of grace after expiry.
create or replace function public.purge_expired_stories()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.stories s
  where not s.is_highlighted
    and s.expires_at < now() - interval '1 hour'
    and not exists (
      select 1 from public.reports r
      where r.target_type = 'STORY' and r.target_id = s.id and r.status in ('OPEN', 'REVIEWING')
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

revoke all on function public.purge_expired_stories() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-expired-stories', '17 3 * * *', 'select public.purge_expired_stories();');
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$cron$;

-- ── 7. Story photos nothing references ───────────────────────
-- A story photo is uploaded first and its row inserted a moment later, so only files older than two hours count.
-- position() rather than LIKE: file names can contain "_", which LIKE treats as a wildcard.
create or replace function public.orphan_story_files(p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = public
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'uploads'
    and o.name like '%/story/%'
    and o.created_at < now() - interval '2 hours'
    and not exists (select 1 from public.stories s where position(o.name in s.image_url) > 0)
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.orphan_story_files(integer) from public, anon, authenticated;
grant execute on function public.orphan_story_files(integer) to service_role;

-- ── 8. Own files are visible to their owner (so deleting them works) ──
-- Scoped exactly like "User scoped delete": the uploads bucket, signed in, first folder = your user id. The bucket
-- is public, so downloading never needed a policy; this adds nothing for anyone else's files.
drop policy if exists "User scoped select" on storage.objects;
create policy "User scoped select" on storage.objects
  for select
  using (
    bucket_id = 'uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
