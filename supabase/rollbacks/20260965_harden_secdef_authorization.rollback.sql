-- Rollback: 20260965_harden_secdef_authorization.rollback.sql
-- Description: Rollback changes from 20260965_harden_secdef_authorization.sql

-- 1. Restore get_nearby_user_ids
CREATE OR REPLACE FUNCTION public.get_nearby_user_ids(p_lat double precision, p_lng double precision, p_radius_km double precision)
 RETURNS SETOF text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.users
   where lat is not null and lng is not null
     and lat between p_lat - (least(p_radius_km, 50) / 111.0) and p_lat + (least(p_radius_km, 50) / 111.0)
     and lng between p_lng - (least(p_radius_km, 50) / 111.0) and p_lng + (least(p_radius_km, 50) / 111.0);
$function$;

REVOKE ALL ON FUNCTION public.get_nearby_user_ids(double precision, double precision, double precision) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_user_ids(double precision, double precision, double precision) TO authenticated;

-- 2. Restore increment_stamp
CREATE OR REPLACE FUNCTION public.increment_stamp(p_card_id text, p_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target int := 10;
  v_reward text := '';
  v_stamps int := 0;
  v_earned bool := false;
BEGIN
  SELECT target, COALESCE(reward, '')
    INTO v_target, v_reward
    FROM public.loyalty_cards
   WHERE id = p_card_id AND is_active = true
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stamps', 0, 'needed', 10, 'rewardEarned', false, 'reward', '');
  END IF;

  INSERT INTO public.user_stamps (user_id, card_id, stamps, updated_at)
  VALUES (p_user_id, p_card_id, 1, now())
  ON CONFLICT (user_id, card_id)
  DO UPDATE SET stamps = user_stamps.stamps + 1, updated_at = now()
  RETURNING stamps INTO v_stamps;

  IF v_stamps >= v_target THEN
    v_earned := true;
    UPDATE public.user_stamps
       SET stamps = v_stamps % v_target, updated_at = now()
     WHERE user_id = p_user_id AND card_id = p_card_id;
    v_stamps := v_stamps % v_target;
  END IF;

  RETURN jsonb_build_object(
    'stamps',      v_stamps,
    'needed',      v_target,
    'rewardEarned', v_earned,
    'reward',      v_reward
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_stamp(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.increment_stamp(text, text) TO authenticated;

-- 3. Restore grants on internal reservation functions
GRANT EXECUTE ON FUNCTION public.reserve_catalog_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_catalog_items(jsonb) TO authenticated;

-- 4. Restore grants on trigger functions
GRANT EXECUTE ON FUNCTION public.notify_admins_business_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_chat_message() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_comment_mention() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_comment_reaction() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_nearby_alert() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_post_like() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_post_resolved() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_qna_answered() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_rating_aggregates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_post_comments_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_post_likes_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_request_proposal_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_delivery_batch_in_progress() TO authenticated;
