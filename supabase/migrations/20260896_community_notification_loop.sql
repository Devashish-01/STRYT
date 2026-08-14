-- ============================================================
-- 20260896 — Close the community loop: engagement notifications + nearby alerts
--
-- WHAT WAS MISSING. Exactly one community action told anybody anything: a new
-- comment notified the post's author (20260718). Everything else was silent —
-- like a post, recommend a business in answer to someone's question, mark a lost
-- dog as found, close a poll, @mention a neighbour, or post an urgent alert
-- about a burst water main, and nobody was told. For a hyperlocal feed that's
-- the whole loop broken: people had to be *already looking* at the app for any
-- of it to matter.
--
-- HOW. Postgres triggers, not client calls. There is already a trigger on
-- `notifications` that fires the push (20260731_push_on_every_notification), so
-- inserting a row delivers the OS-level push too. Adding a fetch() on the client
-- would double-push. This also means these notifications fire for writes from
-- any source — a future admin tool or a backfill gets them for free.
--
-- metadata is a CREATION-TIME SNAPSHOT (actorName/avatarUrl/tone), matching the
-- documented intent of NotificationMetadata in src/types/user.ts: a notification
-- is a historical record and should read as it did when it was created, even if
-- the actor later renames themselves.
--
-- ⚠ NEARBY_ALERT FANS OUT TO MANY PEOPLE. Three guardrails, all in this file:
--   1. ALERT_FANOUT_CAP    — a hard ceiling on recipients per alert.
--   2. ALERT_RATE_*        — per-author limit, so one person can't carpet-bomb.
--   3. users.notif_nearby_alerts — an opt-out honoured at INSERT time, so an
--      opted-out neighbour never even has a row created.
-- Guardrail 3 is deliberately enforced here rather than in send-push: that
-- function's preference allowlist (see 20260859) only silences the *push*, and a
-- broadcast this wide shouldn't be filling someone's in-app list either.
--
-- Run manually in the Supabase SQL editor (idempotent, safe to re-run).
-- ============================================================


-- ── 0. Opt-out for the broadcast type ────────────────────────
alter table public.users
  add column if not exists notif_nearby_alerts boolean not null default true;

comment on column public.users.notif_nearby_alerts is
  'Receive NEARBY_ALERT broadcasts (water cuts, road closures, safety notices) from neighbours. Honoured at notification-insert time, not just at push time.';


-- ── 1. Likes ─────────────────────────────────────────────────
-- Deliberately NOT per-like-spam-protected beyond the self-check: a like is a
-- single deliberate tap, and post_likes has a (post_id, user_id) primary key, so
-- an unlike/relike cycle is the only way to repeat it. That's rare enough to be
-- someone changing their mind rather than an attack.
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post   public.community_posts%rowtype;
  v_actor  text;
  v_avatar text;
begin
  select * into v_post from public.community_posts where id = new.post_id;
  if not found or v_post.author_user_id is null or v_post.author_user_id = new.user_id then
    return new;
  end if;

  -- An author who hid their like count doesn't want the tally; they still want
  -- to know people are responding, so this is intentionally NOT suppressed.
  select coalesce(nullif(alias, ''), 'A neighbour'), avatar
    into v_actor, v_avatar
    from public.users where id = new.user_id;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_post.author_user_id,
    'COMMUNITY_LIKE',
    'Someone liked your post',
    coalesce(v_actor, 'A neighbour') || ' liked "' || left(v_post.title, 50) || '"',
    '/community/' || new.post_id,
    jsonb_build_object('actorName', v_actor, 'avatarUrl', v_avatar, 'tone', 'brand')
  );
  return new;
end
$$;

drop trigger if exists trg_notify_post_like on public.post_likes;
create trigger trg_notify_post_like
  after insert on public.post_likes
  for each row execute function public.notify_on_post_like();


-- ── 2. Recommendations ───────────────────────────────────────
-- The highest-value notification in the set: someone ASKED a question, and this
-- says it was answered. Fires on the recommendations JSONB growing, so it needs
-- to compare array lengths rather than watch a separate table.
create or replace function public.notify_on_post_recommendation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_len int := coalesce(jsonb_array_length(coalesce(old.recommendations, '[]'::jsonb)), 0);
  v_new_len int := coalesce(jsonb_array_length(coalesce(new.recommendations, '[]'::jsonb)), 0);
  v_latest  jsonb;
  v_by      text;
begin
  if v_new_len <= v_old_len or new.author_user_id is null then
    return new;
  end if;

  v_latest := new.recommendations -> (v_new_len - 1);
  v_by := coalesce(v_latest ->> 'byName', 'A neighbour');

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    new.author_user_id,
    'COMMUNITY_RECOMMENDATION',
    'You got a recommendation',
    v_by || ' suggested a place on "' || left(new.title, 50) || '"',
    '/community/' || new.id,
    jsonb_build_object('actorName', v_by, 'tone', 'success')
  );
  return new;
end
$$;

drop trigger if exists trg_notify_post_recommendation on public.community_posts;
create trigger trg_notify_post_recommendation
  after update of recommendations on public.community_posts
  for each row execute function public.notify_on_post_recommendation();


-- ── 3. Resolved ──────────────────────────────────────────────
-- Notifies the people who ENGAGED with a lost-and-found post or an alert that it
-- is over. Without it, a "lost dog" thread keeps drawing replies for days after
-- the dog is home, and neighbours keep acting on a water cut that has ended.
create or replace function public.notify_on_post_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := left(new.title, 50);
begin
  if coalesce(new.resolved, false) = coalesce(old.resolved, false) or not coalesce(new.resolved, false) then
    return new;
  end if;

  -- Everyone who commented or liked, minus the author. A union of both, so a
  -- neighbour who did both gets one notification rather than two.
  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select
    u.uid,
    'COMMUNITY_RESOLVED',
    case when new.type = 'LOST_FOUND' then 'Good news — it was found' else 'That alert is over' end,
    '"' || v_title || '" was marked resolved',
    '/community/' || new.id,
    jsonb_build_object('tone', 'success', 'statusPill', 'Resolved')
  from (
    select author_user_id as uid from public.post_comments where post_id = new.id
    union
    select user_id as uid from public.post_likes where post_id = new.id
  ) u
  where u.uid is not null
    and u.uid <> coalesce(new.author_user_id, '');
  return new;
end
$$;

drop trigger if exists trg_notify_post_resolved on public.community_posts;
create trigger trg_notify_post_resolved
  after update of resolved on public.community_posts
  for each row execute function public.notify_on_post_resolved();


-- ── 4. Mentions ──────────────────────────────────────────────
-- Reads post_comments.mentions (20260895), which holds ids resolved at write
-- time — so this notifies the right person even if they change their alias
-- afterwards, and it can't be spoofed by typing an @ that looks like someone.
create or replace function public.notify_on_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_title text;
begin
  if coalesce(jsonb_array_length(coalesce(new.mentions, '[]'::jsonb)), 0) = 0 then
    return new;
  end if;

  select title into v_post_title from public.community_posts where id = new.post_id;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select
    m ->> 'userId',
    'COMMUNITY_MENTION',
    coalesce(new.author_name, 'Someone') || ' mentioned you',
    'In a comment on "' || left(coalesce(v_post_title, 'a post'), 50) || '": "' || left(new.body, 60) || '"',
    '/community/' || new.post_id,
    jsonb_build_object('actorName', new.author_name, 'avatarUrl', new.author_avatar, 'tone', 'brand')
  from jsonb_array_elements(new.mentions) m
  where nullif(m ->> 'userId', '') is not null
    -- Mentioning yourself is filtered client-side too; belt and braces.
    and m ->> 'userId' <> coalesce(new.author_user_id, '')
    -- A block in either direction means no notification, matching the comment
    -- gate: an @mention must not become a way to reach someone who blocked you.
    -- Calls the internal pair-checker (20260892) directly: neither side here
    -- is necessarily auth.uid() (this trigger can fire for a comment inserted
    -- by any source), so the caller-bound is_blocked_between(text) wrapper
    -- doesn't apply.
    and not public._user_blocks_exists(m ->> 'userId', coalesce(new.author_user_id, ''));
  return new;
end
$$;

drop trigger if exists trg_notify_comment_mention on public.post_comments;
create trigger trg_notify_comment_mention
  after insert on public.post_comments
  for each row execute function public.notify_on_comment_mention();


-- ── 5. Nearby alerts (the fanout) ────────────────────────────
create or replace function public.notify_on_nearby_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Guardrails. Chosen to be useful for a real street and useless for spam:
  -- 2 alerts/hour is more than any genuine emergency needs, and 500 recipients
  -- covers a dense neighbourhood without becoming a broadcast platform.
  ALERT_FANOUT_CAP  constant integer  := 500;
  ALERT_RATE_LIMIT  constant integer  := 2;
  ALERT_RATE_WINDOW constant interval := interval '1 hour';

  v_radius_km double precision := 5;
  v_lat_delta double precision;
  v_recent    integer;
begin
  if new.type <> 'ALERT' or new.geom is null or new.author_user_id is null then
    return new;
  end if;

  -- Serialize concurrent alert inserts from the SAME author for the rest of
  -- this transaction. Without this, two ALERT posts submitted in parallel can
  -- both read the count below before either commits, so both slip in under
  -- ALERT_RATE_LIMIT — the classic check-then-act race.
  perform pg_advisory_xact_lock(hashtextextended('alert_rate:' || new.author_user_id, 0));

  -- Rate limit: count this author's recent alerts (excluding this one).
  select count(*) into v_recent
    from public.community_posts
   where author_user_id = new.author_user_id
     and type = 'ALERT'
     and id <> new.id
     and created_at > now() - ALERT_RATE_WINDOW;
  if v_recent >= ALERT_RATE_LIMIT then
    -- The post itself still stands; only the broadcast is withheld. Silently,
    -- because telling an abuser exactly where the limit is helps them tune.
    return new;
  end if;

  -- Radius: capped by the author's own reach for seller-authored alerts, the
  -- same rule community_posts_feed applies (20260894/20260866).
  if new.author_type = 'business' then
    select least(v_radius_km, greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0))
      into v_radius_km from public.businesses b where b.id = new.author_ref_id;
  elsif new.author_type = 'provider' then
    select least(v_radius_km, greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0))
      into v_radius_km from public.providers p where p.id = new.author_ref_id;
  end if;

  -- Cheap bounding-box pre-filter before the per-row ST_DWithin below. `users`
  -- has no spatial index anywhere in this schema (nothing does — geography is
  -- built on the fly from lat/lng), so without this every ALERT post computes
  -- ST_SetSRID/ST_MakePoint/ST_DWithin for the WHOLE users table. A plain
  -- numeric BETWEEN first narrows that to a cheap comparison — same technique
  -- as notify_on_request (20260706) / 20260721 / 20260836 / 20260840.
  -- ~111km per degree of latitude; not corrected for longitude shrinking at
  -- higher latitudes, matching those.
  v_lat_delta := coalesce(v_radius_km, 5) / 111.0;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select
    u.id,
    'NEARBY_ALERT',
    case coalesce(new.severity, 'INFO')
      when 'URGENT'  then '🚨 Urgent nearby'
      when 'WARNING' then '⚠️ Heads up nearby'
      else 'ℹ️ Notice nearby'
    end,
    left(new.title, 90),
    '/community/' || new.id,
    jsonb_build_object(
      'actorName', new.author_name,
      'avatarUrl', new.author_avatar,
      'tone', case coalesce(new.severity, 'INFO')
                when 'URGENT' then 'danger'
                when 'WARNING' then 'warning'
                else 'info' end,
      'statusPill', coalesce(new.severity, 'INFO')
    )
  from public.users u
  where u.id <> new.author_user_id
    and u.notif_nearby_alerts
    and u.lat is not null
    and u.lng is not null
    and u.lat between new.lat - v_lat_delta and new.lat + v_lat_delta
    and u.lng between new.lng - v_lat_delta and new.lng + v_lat_delta
    and ST_DWithin(
      ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography,
      new.geom,
      coalesce(v_radius_km, 5) * 1000
    )
    -- No alert reaches someone who has blocked the author, or vice versa.
    -- Calls the internal pair-checker (20260892) directly: u.id is a
    -- candidate recipient being enumerated by this query, not the calling
    -- session, so the caller-bound is_blocked_between(text) wrapper doesn't
    -- apply here either.
    and not public._user_blocks_exists(u.id, new.author_user_id)
  -- Nearest first, so if the cap bites it keeps the people the alert is most
  -- relevant to rather than an arbitrary slice.
  order by ST_Distance(ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography, new.geom)
  limit ALERT_FANOUT_CAP;

  return new;
end
$$;

drop trigger if exists trg_notify_nearby_alert on public.community_posts;
create trigger trg_notify_nearby_alert
  after insert on public.community_posts
  for each row execute function public.notify_on_nearby_alert();


-- ── 6. Poll ended ────────────────────────────────────────────
-- A sweep, not a trigger: nothing writes to the row when a poll's time runs out,
-- so there is no event to hang a trigger on. Call it from the same schedule that
-- runs close_expired_requests / close_stale_queue_tokens (see the existing
-- pg_cron/GitHub-Actions jobs), or manually.
--
-- Idempotent via poll_ended_notified_at: a second run inside the same window
-- must not notify the same voters twice.
alter table public.community_posts
  add column if not exists poll_ended_notified_at timestamptz;

create or replace function public.notify_ended_polls()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post   record;
  v_count  integer := 0;
begin
  for v_post in
    select id, title, author_user_id
      from public.community_posts
     where type = 'POLL'
       and poll_ends_at is not null
       and poll_ends_at <= now()
       and poll_ended_notified_at is null
     limit 200
  loop
    -- Everyone who voted, plus the author (who wants the result most).
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    select
      u.uid,
      'COMMUNITY_POLL_ENDED',
      'Poll results are in',
      'Voting closed on "' || left(v_post.title, 50) || '"',
      '/community/' || v_post.id,
      jsonb_build_object('tone', 'info', 'statusPill', 'Closed')
    from (
      select user_id as uid from public.poll_votes where post_id = v_post.id
      union
      select v_post.author_user_id as uid
    ) u
    where u.uid is not null;

    update public.community_posts
       set poll_ended_notified_at = now()
     where id = v_post.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$$;

-- Callable only by the service role / scheduler, never by a signed-in client:
-- it writes notifications for other people.
revoke all on function public.notify_ended_polls() from public, anon, authenticated;

create index if not exists community_posts_poll_pending_notify_idx
  on public.community_posts (poll_ends_at)
  where type = 'POLL' and poll_ended_notified_at is null;
