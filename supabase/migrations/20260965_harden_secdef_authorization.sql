-- Migration: 20260965_harden_secdef_authorization.sql
-- Description: Harden SECURITY DEFINER functions authorization (P05 Step 5.B)
-- 1. Pin admin check on get_nearby_user_ids (prevents location scraping)
-- 2. Guard increment_stamp with auth.uid() check (prevents stranger stamp modification)
-- 3. Revoke EXECUTE from authenticated, anon, public on 13 trigger functions
-- 4. Revoke EXECUTE from authenticated, anon, public on 2 internal catalog reservation functions

-- 1. Restrict get_nearby_user_ids to admins
CREATE OR REPLACE FUNCTION public.get_nearby_user_ids(p_lat double precision, p_lng double precision, p_radius_km double precision)
 RETURNS SETOF text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  RETURN QUERY
    SELECT id FROM public.users
     WHERE lat IS NOT NULL AND lng IS NOT NULL
       AND lat BETWEEN p_lat - (LEAST(p_radius_km, 50) / 111.0) AND p_lat + (LEAST(p_radius_km, 50) / 111.0)
       AND lng BETWEEN p_lng - (LEAST(p_radius_km, 50) / 111.0) AND p_lng + (LEAST(p_radius_km, 50) / 111.0);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_nearby_user_ids(double precision, double precision, double precision) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_user_ids(double precision, double precision, double precision) TO authenticated;

-- 2. Guard increment_stamp against unauthorized user stamping
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF auth.uid()::text <> p_user_id THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

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

-- 3. Revoke EXECUTE on internal catalog reservation functions from all client roles
REVOKE EXECUTE ON FUNCTION public.reserve_catalog_item(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_catalog_items(jsonb) FROM public, anon, authenticated;

-- 4. Revoke EXECUTE on 13 trigger functions from authenticated (triggers execute under function owner)
REVOKE EXECUTE ON FUNCTION public.notify_admins_business_pending() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_chat_message() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment_mention() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment_reaction() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_nearby_alert() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_post_like() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_post_resolved() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_qna_answered() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_rating_aggregates() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_post_comments_count() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_post_likes_count() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_request_proposal_count() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_delivery_batch_in_progress() FROM public, anon, authenticated;
