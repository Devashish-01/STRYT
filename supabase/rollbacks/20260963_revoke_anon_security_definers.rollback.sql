-- Rollback: 20260963_revoke_anon_security_definers.rollback.sql
-- Restores grants on trigger functions and internal helpers verbatim from baseline catalog

-- 1. Trigger functions
GRANT EXECUTE ON FUNCTION public._enforce_business_owner_limit() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_self_vouch() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_places_status_freeze() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_admins_business_pending() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_chat_message() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_comment_mention() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_comment_reaction() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_nearby_alert() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_post_like() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_post_recommendation() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_post_resolved() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_qna_answered() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_qna_asked() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_queue_payment_status() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_rating() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_rating_aggregates() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_post_comments_count() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_post_likes_count() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_request_proposal_count() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_bulk_deal_pledge_check_target() TO public, anon, authenticated;

-- 2. Internal helpers
GRANT EXECUTE ON FUNCTION public._bulk_deal_close_internal(p_deal_id text, p_trigger text, p_outcome text) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_bulk_deal_target_and_close(p_deal_id text) TO public, anon, authenticated;
