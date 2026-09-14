-- Migration: 20260963_revoke_anon_security_definers.sql
-- Description: Revoke EXECUTE on 20 trigger functions and 2 internal helpers from public/anon (F2)
-- Closes Security Advisor finding anon_security_definer_function_executable on trigger & internal functions

-- 1. Trigger functions: revoke EXECUTE from public, anon (triggers execute under function owner)
REVOKE EXECUTE ON FUNCTION public._enforce_business_owner_limit() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_self_vouch() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_places_status_freeze() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_admins_business_pending() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_chat_message() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment_mention() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment_reaction() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_nearby_alert() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_post_like() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_post_recommendation() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_post_resolved() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_qna_answered() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_qna_asked() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_queue_payment_status() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_rating() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_rating_aggregates() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.sync_post_comments_count() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.sync_post_likes_count() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.sync_request_proposal_count() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.trg_bulk_deal_pledge_check_target() FROM public, anon;

-- 2. Internal helpers: revoke EXECUTE from public, anon, authenticated (invoked only by triggers)
REVOKE EXECUTE ON FUNCTION public._bulk_deal_close_internal(p_deal_id text, p_trigger text, p_outcome text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_bulk_deal_target_and_close(p_deal_id text) FROM public, anon, authenticated;
