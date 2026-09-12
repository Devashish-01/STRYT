-- ============================================================
-- Rollback for 20260953_trust_safety_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Restore notify_on_rating ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_user text;
  v_deep_link text;
  v_name text;
begin
  if new.rater_user_id is null then
    return new;
  end if;

  select name into v_name from public.users where id = new.rater_user_id;

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

  if v_target_user is not null and v_target_user != new.rater_user_id then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        v_target_user,
        'RATING',
        'New customer review',
        coalesce(v_name, 'A customer') || ' gave ' ||
          case when new.rating >= 4 then '⭐ ' else '' end || new.rating || '/5' ||
          case when new.comment is not null and length(trim(new.comment)) > 0
               then ' — "' || left(new.comment, 80) || '"' else '' end,
        v_deep_link
      );
    exception when others then null;
    end;
  end if;

  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_rating() TO anon, authenticated, postgres, service_role, PUBLIC;

-- ── Restore reply_to_rating ─────────────────────────
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
  v_is_authorized boolean := false;
  v_clean_reply text := trim(coalesce(p_reply, ''));
  v_rating public.ratings%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select ratee_type, ratee_id into v_ratee_type, v_ratee_id
  from public.ratings where id = p_rating_id;
  if not found then raise exception 'RATING_NOT_FOUND'; end if;

  if v_ratee_type = 'BUSINESS' then
    select owner_user_id into v_owner from public.businesses where id = v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    else
      -- Check team permissions
      select exists (
        select 1 from public.team_members
        where business_id = v_ratee_id::uuid
          and user_id = v_uid::uuid
          and status = 'ACTIVE'
          and (role in ('owner', 'manager') or 'support' = any(scopes) or 'leads' = any(scopes))
      ) into v_is_authorized;
    end if;
  elsif v_ratee_type = 'PROVIDER' then
    select user_id into v_owner from public.providers where id = v_ratee_id;
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
  end if;

  return v_rating;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.reply_to_rating(p_rating_id text, p_reply text) TO authenticated, postgres, service_role;

-- ── Restore notify_on_report_resolved ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_report_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    new.reporter_user_id,
    'REPORT_RESOLVED',
    'Your report was reviewed',
    'Your report on "' || coalesce(new.target_name, 'a listing') || '" has been reviewed by our team.',
    deep_link,
    jsonb_build_object(
      'statusPill', case new.status when 'ACTION_TAKEN' then 'Action taken' else 'Reviewed' end,
      'tone', case new.status when 'ACTION_TAKEN' then 'success' else 'neutral' end
    )
  );
  return new;
end $function$
;
GRANT EXECUTE ON FUNCTION public.notify_on_report_resolved() TO postgres, service_role;

-- ── Restore notify_admins_business_pending ─────────────────────────
CREATE OR REPLACE FUNCTION public.notify_admins_business_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin record;
begin
  -- Only the edge into PENDING. On INSERT, OLD is unassigned — referencing it
  -- raises — so TG_OP is checked rather than coalescing the two records.
  if new.status is distinct from 'PENDING' then return new; end if;
  if TG_OP = 'UPDATE' and old.status is not distinct from 'PENDING' then return new; end if;

  for v_admin in
    select id from public.users where 'admin' = any(roles)
  loop
    insert into public.notifications (user_id, type, title, body, deep_link, entity_type, entity_id)
    values (
      v_admin.id,
      'ADMIN_REVIEW_QUEUE',
      'Business awaiting review',
      coalesce(new.name, 'A business') ||
        coalesce(' · ' || nullif(new.city, ''), '') ||
        ' is waiting for approval.',
      '/admin',
      'BUSINESS',
      new.id
    );
  end loop;

  return new;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.notify_admins_business_pending() TO anon, authenticated, postgres, service_role, PUBLIC;

notify pgrst, 'reload schema';
