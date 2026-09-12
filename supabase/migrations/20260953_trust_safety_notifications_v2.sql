-- ============================================================
-- Migration: 20260953_trust_safety_notifications_v2.sql
-- Group 7: Trust, Ratings, Reviews & Safety Reports Notifications Overhaul
--
-- Fixes:
-- 1. RATING NOTIFICATIONS:
--    - Sets entity_type (BUSINESS / PROVIDER) and entity_id (new.ratee_id)
--      so that business and provider consoles receive rating notifications.
--    - Enriches metadata with rating score, ratingId, comment, raterName,
--      avatarUrl, statusPill ('N/5 ★'), semantic tone, and inline actions
--      ['REPLY_RATING', 'VIEW_REVIEW'].
-- 2. RATING_REPLY NOTIFICATIONS:
--    - When an owner/manager posts a reply via reply_to_rating, sends a
--      RATING_REPLY notification to the rater with rateeName, rateeAvatar,
--      replyText, statusPill ('Owner Replied'), and actions ['VIEW_REVIEW', 'VIEW_STORE'].
-- 3. REPORT_RESOLVED NOTIFICATIONS:
--    - Enriches report resolution notifications with reportId, targetType,
--      targetName, statusPill ('Action Taken' / 'Reviewed & Dismissed'),
--      and action ['VIEW_REPORT_TARGET'].
-- 4. ADMIN_REVIEW_QUEUE NOTIFICATIONS:
--    - Enriches admin verification queue notifications with businessName,
--      category, imageUrl, statusPill ('Pending Approval'), and actions
--      ['REVIEW_BUSINESS', 'VIEW_ADMIN'].
-- ============================================================

-- ── 1) RATING Notifications on INSERT on public.ratings ──
create or replace function public.notify_on_rating() returns trigger as $$
declare
  v_target_user text;
  v_deep_link text;
  v_name text;
  v_avatar text;
  v_tone text;
begin
  if new.rater_user_id is null then
    return new;
  end if;

  select name, avatar into v_name, v_avatar from public.users where id = new.rater_user_id;

  if new.ratee_type = 'BUSINESS' then
    select owner_user_id into v_target_user from public.businesses where id = new.ratee_id;
    v_deep_link := '/business/' || new.ratee_id || '/manage/reviews';
  elsif new.ratee_type = 'PROVIDER' then
    select user_id into v_target_user from public.providers where id = new.ratee_id;
    v_deep_link := '/provider/' || new.ratee_id || '/manage/reviews';
  elsif new.ratee_type = 'USER' then
    v_target_user := new.ratee_id;
    v_deep_link := coalesce('/agreement/' || new.agreement_id, '/u/' || new.ratee_id);
  end if;

  if new.rating >= 4 then
    v_tone := 'success';
  elsif new.rating = 3 then
    v_tone := 'warning';
  else
    v_tone := 'danger';
  end if;

  if v_target_user is not null and v_target_user != new.rater_user_id then
    begin
      insert into public.notifications (
        user_id, type, title, body, deep_link, entity_type, entity_id, metadata
      ) values (
        v_target_user,
        'RATING',
        'New customer review (' || new.rating || '★)',
        coalesce(v_name, 'A customer') || ' gave ' ||
          case when new.rating >= 4 then '⭐ ' else '' end || new.rating || '/5' ||
          case when new.comment is not null and length(trim(new.comment)) > 0
               then ' — "' || left(trim(new.comment), 80) || '"' else '' end,
        v_deep_link,
        case when new.ratee_type in ('BUSINESS', 'PROVIDER') then new.ratee_type else null end,
        case when new.ratee_type in ('BUSINESS', 'PROVIDER') then new.ratee_id else null end,
        jsonb_build_object(
          'ratingId', new.id,
          'rating', new.rating,
          'comment', new.comment,
          'raterName', v_name,
          'actorName', v_name,
          'avatarUrl', v_avatar,
          'rateeType', new.ratee_type,
          'rateeId', new.ratee_id,
          'statusPill', new.rating || '/5 ★',
          'tone', v_tone,
          'actions', jsonb_build_array('REPLY_RATING', 'VIEW_REVIEW')
        )
      );
    exception when others then null;
    end;
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;


-- ── 2) RATING_REPLY Notification on reply_to_rating ──
create or replace function public.reply_to_rating(p_rating_id text, p_reply text)
 returns ratings
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    select owner_user_id, name, logo into v_owner, v_ratee_name, v_ratee_avatar
    from public.businesses where id = v_ratee_id;
    v_deep_link := '/business/' || v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    else
      select exists (
        select 1 from public.team_members
        where business_id = v_ratee_id::uuid
          and user_id = v_uid::uuid
          and status = 'ACTIVE'
          and (role in ('owner', 'manager') or 'support' = any(scopes) or 'leads' = any(scopes))
      ) into v_is_authorized;
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

revoke execute on function public.reply_to_rating(text, text) from public, anon;
grant execute on function public.reply_to_rating(text, text) to authenticated;


-- ── 3) REPORT_RESOLVED Notification Enrichment ──
create or replace function public.notify_on_report_resolved() returns trigger as $$
declare
  v_deep_link text;
  v_status_pill text;
  v_tone text;
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

  v_deep_link := case new.target_type
    when 'POST' then '/community/' || new.target_id
    when 'BUSINESS' then '/business/' || new.target_id
    when 'PROVIDER' then '/provider/' || new.target_id
    when 'REQUEST' then '/request/' || new.target_id
    else '/community'
  end;

  if new.status = 'ACTION_TAKEN' then
    v_status_pill := 'Action Taken';
    v_tone := 'success';
  else
    v_status_pill := 'Reviewed';
    v_tone := 'neutral';
  end if;

  begin
    insert into public.notifications (
      user_id, type, title, body, deep_link, entity_type, entity_id, metadata
    ) values (
      new.reporter_user_id,
      'REPORT_RESOLVED',
      'Report reviewed: ' || coalesce(new.target_name, 'Item'),
      case
        when new.status = 'ACTION_TAKEN'
        then 'Thank you for helping keep our street safe. Action has been taken regarding "' || coalesce(new.target_name, 'this item') || '".'
        else 'Our team reviewed your report on "' || coalesce(new.target_name, 'this item') || '" and found it adheres to community standards.'
      end,
      v_deep_link,
      new.target_type,
      new.target_id,
      jsonb_build_object(
        'reportId', new.id,
        'targetType', new.target_type,
        'targetId', new.target_id,
        'targetName', new.target_name,
        'statusPill', v_status_pill,
        'tone', v_tone,
        'actions', jsonb_build_array('VIEW_REPORT_TARGET')
      )
    );
  exception when others then null;
  end;

  return new;
end $$ language plpgsql security definer set search_path = public;


-- ── 4) ADMIN_REVIEW_QUEUE Notification Enrichment ──
create or replace function public.notify_admins_business_pending()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  if new.status is distinct from 'PENDING' then return new; end if;
  if TG_OP = 'UPDATE' and old.status is not distinct from 'PENDING' then return new; end if;

  for v_admin in
    select id from public.users where 'admin' = any(roles)
  loop
    begin
      insert into public.notifications (
        user_id, type, title, body, deep_link, entity_type, entity_id, metadata
      ) values (
        v_admin.id,
        'ADMIN_REVIEW_QUEUE',
        'Business awaiting review: ' || coalesce(new.name, 'Store'),
        coalesce(new.name, 'A business') ||
          coalesce(' · ' || nullif(new.city, ''), '') ||
          ' is waiting for admin verification.',
        '/admin',
        'BUSINESS',
        new.id,
        jsonb_build_object(
          'businessName', new.name,
          'category', new.category,
          'imageUrl', new.cover_url,
          'targetId', new.id,
          'targetType', 'BUSINESS',
          'statusPill', 'Pending Approval',
          'tone', 'warning',
          'actions', jsonb_build_array('REVIEW_BUSINESS', 'VIEW_ADMIN')
        )
      );
    exception when others then null;
    end;
  end loop;

  return new;
end
$$;
