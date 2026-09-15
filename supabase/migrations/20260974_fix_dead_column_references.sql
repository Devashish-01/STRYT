-- Three functions that reference columns/tables that don't exist. plpgsql bodies are not validated at CREATE, so each
-- failed only when it ran (found by the P07 E2E suite and scripts/audit/function-dead-refs.mjs; confirmed on staging):
--
-- 1) reply_to_rating (20260953): reads businesses.logo (the business image column is cover_image) and, for team
--    members, a public.team_members table that has never existed (with text ids cast to uuid). Every owner reply to
--    a review failed with 42703; production has never recorded an owner reply (E2E-016). Team access now uses
--    has_business_scope(business, uid, 'leads') — owner, FULL access, or the Leads & quotes scope.
-- 2) notify_on_story_reaction: reads stories.business_id (stories store owner_type/owner_id). The AFTER trigger has no
--    exception handler, so every story reaction was rolled back with 42703 (E2E-017). Seller stories now tag the
--    notification with BUSINESS/PROVIDER + owner_id; user stories carry no entity, as before.
-- 3) notify_on_post_recommendation: reads providers.name (the column is display_name). Recommending a provider on a
--    community post failed with 42703; businesses worked (E2E-018).
--
-- Each function is its live definition with only the lines above changed. Grants restated per HANDOFF §5; the one
-- change is EXECUTE on the trigger-only notify_on_post_recommendation() removed from authenticated (a trigger does not
-- need the caller to hold EXECUTE; P05 did the same for 13 other trigger functions).
-- Rollback: supabase/rollbacks/20260974_fix_dead_column_references.rollback.sql

CREATE OR REPLACE FUNCTION public.reply_to_rating(p_rating_id text, p_reply text)
 RETURNS ratings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_ratee_type text;
  v_ratee_id text;
  v_owner text;
  v_ratee_name text;
  v_ratee_avatar text;
  v_is_authorized boolean := false;
  v_clean_reply text := trim(coalesce(p_reply, ''));
  v_rating public.ratings%rowtype;
  v_deep_link text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_rating
  from public.ratings where id = p_rating_id;
  if not found then raise exception 'RATING_NOT_FOUND'; end if;

  v_ratee_type := v_rating.ratee_type;
  v_ratee_id := v_rating.ratee_id;

  if v_ratee_type = 'BUSINESS' then
    select owner_user_id, name, cover_image into v_owner, v_ratee_name, v_ratee_avatar
    from public.businesses where id = v_ratee_id;
    v_deep_link := '/business/' || v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    else
      -- Team members with the Leads & quotes scope (or full access) answer customers, reviews included.
      v_is_authorized := public.has_business_scope(v_ratee_id, v_uid, 'leads');
    end if;
  elsif v_ratee_type = 'PROVIDER' then
    select user_id, display_name, avatar into v_owner, v_ratee_name, v_ratee_avatar
    from public.providers where id = v_ratee_id;
    v_deep_link := '/provider/' || v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    end if;
  else
    raise exception 'NOT_REPLYABLE';
  end if;

  if not v_is_authorized then
    raise exception 'FORBIDDEN';
  end if;

  if length(v_clean_reply) = 0 then
    -- Clear existing reply
    update public.ratings
    set owner_reply = null, owner_reply_at = null
    where id = p_rating_id
    returning * into v_rating;
  else
    if length(v_clean_reply) < 2 then raise exception 'REPLY_TOO_SHORT'; end if;
    update public.ratings
    set owner_reply = left(v_clean_reply, 2000), owner_reply_at = now()
    where id = p_rating_id
    returning * into v_rating;

    -- Notify the customer about the owner's reply
    if v_rating.rater_user_id is not null and v_rating.rater_user_id <> v_uid then
      begin
        insert into public.notifications (
          user_id, type, title, body, deep_link, entity_type, entity_id, metadata
        ) values (
          v_rating.rater_user_id,
          'RATING_REPLY',
          coalesce(v_ratee_name, 'Owner') || ' replied to your review',
          coalesce(v_ratee_name, 'They') || ': "' || left(v_clean_reply, 120) || '"',
          v_deep_link,
          v_ratee_type,
          v_ratee_id,
          jsonb_build_object(
            'ratingId', v_rating.id,
            'rating', v_rating.rating,
            'replyText', v_clean_reply,
            'actorName', v_ratee_name,
            'avatarUrl', v_ratee_avatar,
            'targetType', v_ratee_type,
            'targetId', v_ratee_id,
            'statusPill', 'Owner Replied',
            'tone', 'brand',
            'actions', jsonb_build_array('VIEW_REVIEW', 'VIEW_STORE')
          )
        );
      exception when others then null;
      end;
    end if;
  end if;

  return v_rating;
end
$function$;

revoke all on function public.reply_to_rating(text, text) from public, anon;
grant execute on function public.reply_to_rating(text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_story_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_story_owner   text;
  v_story_image   text;
  v_story_type    text;
  v_story_entity  text;
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

  select user_id, image_url, owner_type, owner_id into v_story_owner, v_story_image, v_story_type, v_story_entity
    from public.stories where id = new.story_id;

  if v_story_owner is null or v_story_owner = new.viewer_user_id then
    return new;
  end if;

  select coalesce(nullif(alias, ''), 'A neighbour'), avatar
    into v_viewer_name, v_viewer_avatar
    from public.users where id = new.viewer_user_id;

  -- Seller stories are owned by the business/provider (owner_type/owner_id); user stories have no entity.
  v_entity_type := case v_story_type when 'business' then 'BUSINESS' when 'provider' then 'PROVIDER' end;
  if v_entity_type is null then
    v_story_entity := null;
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
    v_story_entity
  );
  return new;
end $function$;

revoke all on function public.notify_on_story_reaction() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_post_recommendation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select display_name, avatar, user_id
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
$function$;

revoke all on function public.notify_on_post_recommendation() from public, anon, authenticated;
