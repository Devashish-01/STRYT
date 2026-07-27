-- ============================================================
-- 20260854 — Revoke anon EXECUTE on the delivery RPCs
--
-- APPLIED TO PRODUCTION as migration `revoke_anon_on_delivery_rpcs`.
--
-- Postgres grants EXECUTE to PUBLIC by default, so every delivery RPC added in
-- phases 1-4 was reachable by the `anon` role — the phase migrations only ever
-- said `GRANT ... TO authenticated` without a matching REVOKE. Each function
-- raises UNAUTHENTICATED on a null auth.uid(), so nothing was exploitable, but
-- the rest of the codebase consistently REVOKEs first (see
-- 20260828_switch_pin.sql) and the Supabase security advisor flags the gap.
--
-- Deliberately NOT revoked:
--   * get_tracking — the public /track/:token page is anon by design.
--   * has_business_scope / can_manage_business — evaluated inside RLS policy
--     expressions as the querying role, so revoking anon would break anonymous
--     SELECTs on business-owned tables.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.assign_delivery_batch(text[], text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.accept_delivery_batch(text, text[]) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.decline_delivery_batch(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.assign_delivery(text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_handoff(text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.appointment_update_delivery_status(text, text, double precision, double precision) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.my_deliveries() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.appointment_create_tracking_token(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.assign_delivery_batch(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery_batch(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_delivery_batch(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_delivery(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_handoff(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_update_delivery_status(text, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_create_tracking_token(text) TO authenticated;
