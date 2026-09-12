-- ============================================================
-- Rollback for 20260949_community_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Restore notify_on_post_like ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_post_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_post_like() TO anon, authenticated, postgres, service_role, PUBLIC;

-- ── Restore notify_on_post_comment ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_post_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  post_owner text;
  post_title text;
  v_parent_author text;
begin
  select author_user_id, title into post_owner, post_title
    from public.community_posts where id = new.post_id;

  if new.parent_id is not null then
    select author_user_id into v_parent_author
      from public.post_comments where id = new.parent_id;
  end if;

  -- 1) The person being replied to.
  if v_parent_author is not null and v_parent_author <> new.author_user_id then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_parent_author,
      'COMMUNITY_REPLY',
      'New reply to your comment',
      coalesce(new.author_name, 'Someone') || ' replied: "' || left(new.body, 60) || '"',
      '/community/' || new.post_id,
      jsonb_build_object('avatarUrl', new.author_avatar, 'actorName', new.author_name, 'tone', 'brand')
    );
  end if;

  -- 2) The post's author — unless they wrote this comment, or they already got
  --    the reply notification above as the parent commenter.
  if post_owner is not null
     and post_owner <> new.author_user_id
     and post_owner is distinct from v_parent_author then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      post_owner,
      'COMMUNITY_COMMENT',
      'New comment on your post',
      coalesce(new.author_name, 'Someone') || ' commented: "' || left(new.body, 60) || '"',
      '/community/' || new.post_id,
      jsonb_build_object('avatarUrl', new.author_avatar, 'actorName', new.author_name, 'tone', 'brand')
    );
  end if;

  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_post_comment() TO postgres, service_role;

-- ── Restore notify_on_post_recommendation ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_post_recommendation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_post_recommendation() TO anon, authenticated, postgres, service_role, PUBLIC;

-- ── Restore notify_on_nearby_alert ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_nearby_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_nearby_alert() TO anon, authenticated, postgres, service_role, PUBLIC;

-- ── Restore notify_on_story_reaction ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_story_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  story_owner text;
  story_image text;
begin
  if new.reaction is null then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.reaction is not distinct from new.reaction then
    return new;
  end if;

  select user_id, image_url into story_owner, story_image
    from public.stories where id = new.story_id;

  if story_owner is null or story_owner = new.viewer_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    story_owner,
    'STORY_REACTION',
    'Someone reacted to your story',
    new.reaction || ' reacted to your story',
    null,
    jsonb_build_object('imageUrl', story_image, 'emoji', new.reaction, 'tone', 'brand')
  );
  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_story_reaction() TO postgres, service_role;

-- ── Restore notify_on_post_resolved ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_post_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_post_resolved() TO anon, authenticated, postgres, service_role, PUBLIC;

notify pgrst, 'reload schema';
