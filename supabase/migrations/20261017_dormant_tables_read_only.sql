-- ============================================================
-- 20261017 — Tables of removed features are read-only for clients (GAPS #47)
--
-- The subscription screens were deleted (D3) and "Pro" was never built, but the
-- tables stayed writable with no state rules:
--   subscriptions      RLS sub_own (ALL): either party could set any status,
--                      including reopening a CANCELLED subscription
--   subscription_logs  RLS sublog_own / sublog_update: same
--   pro_payments       RLS pro_own (ALL, no new-row check): a user could insert
--                      or update their own row as status = 'PAID'
-- Nothing reads them today (no database function references them; the only
-- app code, subscriptionService, had no callers and is deleted in the same
-- change). All three are empty in production (2026-11-13). Whoever brings a
-- feature back gives it RPCs with a transition table, like agreements.
-- SELECT is kept so nothing that reads them breaks.
-- Rollback: supabase/rollbacks/20261017_dormant_tables_read_only.rollback.sql
-- ============================================================

revoke insert, update, delete, truncate on public.subscriptions      from anon, authenticated;
revoke insert, update, delete, truncate on public.subscription_logs  from anon, authenticated;
revoke insert, update, delete, truncate on public.pro_payments       from anon, authenticated;

notify pgrst, 'reload schema';
