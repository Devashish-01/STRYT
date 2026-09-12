-- ============================================================
-- Migration 20260949: Community, Feeds, Street Alerts & Social V2
--
-- Upgrades community and social notifications across Customer, Business, and Provider:
--  1) Fixes scoping bug: Stamps entity_type ('BUSINESS' | 'PROVIDER') and entity_id
--     for posts/comments/stories authored on behalf of businesses/providers so
--     scoped feeds (?scope=BUSINESS&id=...) no longer silently drop them.
--  2) Closes recommendation loop: When a business or provider is recommended by
--     a neighbour, the business/provider owner is directly notified!
--  3) Enriches recommendations with recommended entity name, ID, type, and avatar.
--  4) Enhances nearby alerts with severity, area, and actions ('VIEW_POST', 'SHARE_ALERT').
--  5) Fixes story reactions: Adds actor alias/avatar, deep_link, and story scoping.
--  6) Adds contextual actions ('REPLY_COMMENT', 'VIEW_POST') across comments and replies.
-- ============================================================

-- ── 1) notify_on_post_like ───────────────────────────────────
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post        public.community_posts%rowtype;
  v_actor       text;
  v_avatar      text;
  v_entity_type text;
  v_entity_id   text;
begin
  select * into v_post from public.community_posts where id = new.post_id;
  if not found or v_post.author_user_id is null or v_post.author_user_id = new.user_id then
    return new;
  end if;

  select coalesce(nullif(alias, ''), 'A neighbour'), avatar
    into v_actor, v_avatar
    from public.users where id = new.user_id;

  if v_post.author_type = 'business' and v_post.author_ref_id is not null then
    v_entity_type := 'BUSINESS';
    v_entity_id   := v_post.author_ref_id;
  elsif v_post.author_type = 'provider' and v_post.author_ref_id is not null then
    v_entity_type := 'PROVIDER';
    v_entity_id   := v_post.author_ref_id;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
  values (
    v_post.author_user_id,
    'COMMUNITY_LIKE',
    'Someone liked your post',
    coalesce(v_actor, 'A neighbour') || ' liked "' || left(v_post.title, 50) || '"',
    '/community/' || new.post_id,
    jsonb_build_object(
      'postId', new.post_id,
      'actorName', v_actor,
      'avatarUrl', v_avatar,
      'tone', 'brand',
      'actions', jsonb_build_array('VIEW_POST')
    ),
    v_entity_type,
    v_entity_id
  );
  return new;
end
$$;

-- ── 2) notify_on_post_comment ────────────────────────────────
create or replace function public.notify_on_post_comment()
returns trigger as $$
declare
  v_post          public.community_posts%rowtype;
  v_parent_author text;
  v_entity_type   text;
  v_entity_id     text;
begin
  select * into v_post from public.community_posts where id = new.post_id;
  if not found then return new; end if;

  if new.parent_id is not null then
    select author_user_id into v_parent_author
      from public.post_comments where id = new.parent_id;
  end if;

  if v_post.author_type = 'business' and v_post.author_ref_id is not null then
    v_entity_type := 'BUSINESS';
    v_entity_id   := v_post.author_ref_id;
  elsif v_post.author_type = 'provider' and v_post.author_ref_id is not null then
    v_entity_type := 'PROVIDER';
    v_entity_id   := v_post.author_ref_id;
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
      jsonb_build_object(
        'postId', new.post_id,
        'commentId', new.id,
        'avatarUrl', new.author_avatar,
        'actorName', new.author_name,
        'tone', 'brand',
        'actions', jsonb_build_array('REPLY_COMMENT')
      )
    );
  end if;

  -- 2) The post's author — unless they wrote this comment, or they already got
  --    the reply notification above as the parent commenter.
  if v_post.author_user_id is not null
     and v_post.author_user_id <> new.author_user_id
     and v_post.author_user_id is distinct from v_parent_author then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      v_post.author_user_id,
      'COMMUNITY_COMMENT',
      'New comment on your post',
      coalesce(new.author_name, 'Someone') || ' commented: "' || left(new.body, 60) || '"',
      '/community/' || new.post_id,
      jsonb_build_object(
        'postId', new.post_id,
        'commentId', new.id,
        'avatarUrl', new.author_avatar,
        'actorName', new.author_name,
        'tone', 'brand',
        'actions', jsonb_build_array('REPLY_COMMENT')
      ),
      v_entity_type,
      v_entity_id
    );
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

-- ── 3) notify_on_post_recommendation ─────────────────────────
create or replace function public.notify_on_post_recommendation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_len       int := coalesce(jsonb_array_length(coalesce(old.recommendations, '[]'::jsonb)), 0);
  v_new_len       int := coalesce(jsonb_array_length(coalesce(new.recommendations, '[]'::jsonb)), 0);
  v_latest        jsonb;
  v_by            text;
  v_by_uid        text;
  v_listing_type  text;
  v_listing_id    text;
  v_rec_name      text;
  v_rec_avatar    text;
  v_rec_owner     text;
begin
  if v_new_len <= v_old_len then
    return new;
  end if;

  v_latest       := new.recommendations -> (v_new_len - 1);
  v_by           := coalesce(v_latest ->> 'byName', 'A neighbour');
  v_by_uid       := v_latest ->> 'byUserId';
  v_listing_type := v_latest ->> 'listingType';
  v_listing_id   := v_latest ->> 'listingId';

  -- Resolve the recommended entity details & owner
  if v_listing_type = 'BUSINESS' and v_listing_id is not null then
    select name, cover_image, owner_user_id
      into v_rec_name, v_rec_avatar, v_rec_owner
      from public.businesses where id = v_listing_id;
  elsif v_listing_type = 'PROVIDER' and v_listing_id is not null then
    select name, avatar, user_id
      into v_rec_name, v_rec_avatar, v_rec_owner
      from public.providers where id = v_listing_id;
  end if;

  -- 1) Notify the post author who asked for recommendations
  if new.author_user_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.author_user_id,
      'COMMUNITY_RECOMMENDATION',
      'You got a recommendation',
      v_by || ' recommended ' || coalesce(v_rec_name, 'a place') || ' on "' || left(new.title, 40) || '"',
      '/community/' || new.id,
      jsonb_build_object(
        'postId', new.id,
        'actorName', v_by,
        'recommendedName', v_rec_name,
        'recommendedId', v_listing_id,
        'recommendedType', v_listing_type,
        'recommendedAvatar', v_rec_avatar,
        'statusPill', 'Recommended',
        'tone', 'success',
        'actions', case when v_listing_id is not null
                        then jsonb_build_array('VIEW_RECOMMENDED', 'VIEW_POST')
                        else jsonb_build_array('VIEW_POST') end
      )
    );
  end if;

  -- 2) Notify the recommended business/provider owner (closing the loop!)
  if v_rec_owner is not null and v_rec_owner is distinct from v_by_uid then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      v_rec_owner,
      'COMMUNITY_RECOMMENDATION',
      'Your ' || case when v_listing_type = 'BUSINESS' then 'business' else 'service' end || ' was recommended! 🌟',
      v_by || ' recommended ' || coalesce(v_rec_name, 'your place') || ' to neighbours on: "' || left(new.title, 40) || '".',
      '/community/' || new.id,
      jsonb_build_object(
        'postId', new.id,
        'actorName', v_by,
        'recommendedName', v_rec_name,
        'recommendedId', v_listing_id,
        'recommendedType', v_listing_type,
        'statusPill', 'Recommended',
        'tone', 'success',
        'actions', jsonb_build_array('VIEW_POST')
      ),
      v_listing_type,
      v_listing_id
    );
  end if;

  return new;
end
$$;

-- ── 4) notify_on_nearby_alert ────────────────────────────────
create or replace function public.notify_on_nearby_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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

  perform pg_advisory_xact_lock(hashtextextended('alert_rate:' || new.author_user_id, 0));

  select count(*) into v_recent
    from public.community_posts
   where author_user_id = new.author_user_id
     and type = 'ALERT'
     and id <> new.id
     and created_at > now() - ALERT_RATE_WINDOW;
  if v_recent >= ALERT_RATE_LIMIT then
    return new;
  end if;

  if new.author_type = 'business' then
    select least(v_radius_km, greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0))
      into v_radius_km from public.businesses b where b.id = new.author_ref_id;
  elsif new.author_type = 'provider' then
    select least(v_radius_km, greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0))
      into v_radius_km from public.providers p where p.id = new.author_ref_id;
  end if;

  v_lat_delta := coalesce(v_radius_km, 5) / 111.0;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select
    u.id,
    'NEARBY_ALERT',
    case coalesce(new.severity, 'INFO')
      when 'URGENT'  then '🚨 Urgent Street Alert'
      when 'WARNING' then '⚠️ Nearby Warning'
      else 'ℹ️ Neighbourhood Notice'
    end,
    left(new.title, 90),
    '/community/' || new.id,
    jsonb_build_object(
      'postId', new.id,
      'actorName', new.author_name,
      'avatarUrl', new.author_avatar,
      'severity', coalesce(new.severity, 'INFO'),
      'area', new.area,
      'tone', case coalesce(new.severity, 'INFO')
                when 'URGENT' then 'danger'
                when 'WARNING' then 'warning'
                else 'info' end,
      'statusPill', coalesce(new.severity, 'INFO'),
      'actions', jsonb_build_array('VIEW_POST', 'SHARE_ALERT')
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
    and not public._user_blocks_exists(u.id, new.author_user_id)
  order by ST_Distance(ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography, new.geom)
  limit ALERT_FANOUT_CAP;

  return new;
end
$$;

-- ── 5) notify_on_story_reaction ──────────────────────────────
create or replace function public.notify_on_story_reaction()
returns trigger as $$
declare
  v_story_owner   text;
  v_story_image   text;
  v_story_biz     text;
  v_viewer_name   text;
  v_viewer_avatar text;
  v_entity_type   text;
begin
  if new.reaction is null then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.reaction is not distinct from new.reaction then
    return new;
  end if;

  select user_id, image_url, business_id into v_story_owner, v_story_image, v_story_biz
    from public.stories where id = new.story_id;

  if v_story_owner is null or v_story_owner = new.viewer_user_id then
    return new;
  end if;

  select coalesce(nullif(alias, ''), 'A neighbour'), avatar
    into v_viewer_name, v_viewer_avatar
    from public.users where id = new.viewer_user_id;

  if v_story_biz is not null then
    v_entity_type := 'BUSINESS';
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
  values (
    v_story_owner,
    'STORY_REACTION',
    coalesce(v_viewer_name, 'A neighbour') || ' reacted ' || new.reaction,
    'Reacted ' || new.reaction || ' to your story',
    '/stories',
    jsonb_build_object(
      'storyId', new.story_id,
      'actorName', v_viewer_name,
      'avatarUrl', v_viewer_avatar,
      'imageUrl', v_story_image,
      'emoji', new.reaction,
      'tone', 'brand'
    ),
    v_entity_type,
    v_story_biz
  );
  return new;
end $$ language plpgsql security definer set search_path = public;

-- ── 6) notify_on_post_resolved ───────────────────────────────
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

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select
    u.uid,
    'COMMUNITY_RESOLVED',
    case when new.type = 'LOST_FOUND' then 'Good news — it was found' else 'That alert is over' end,
    '"' || v_title || '" was marked resolved',
    '/community/' || new.id,
    jsonb_build_object(
      'postId', new.id,
      'tone', 'success',
      'statusPill', 'Resolved',
      'actions', jsonb_build_array('VIEW_POST')
    )
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
