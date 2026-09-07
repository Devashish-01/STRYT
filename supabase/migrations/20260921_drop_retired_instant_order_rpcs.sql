-- ============================================================
-- 20260921 — Fix gap log #18: drop the retired instant-order RPCs.
--
-- This completes a cleanup 20260900 explicitly deferred rather than a new
-- decision. That migration's own header says:
--
--   "bulk_deal_order()/bulk_deal_quote() (the old instant-purchase RPCs) are
--    left in place, untouched, in this migration — the client still calls
--    them until the pledge-flow ships (a later phase). Do not drop them here."
--
-- The pledge flow has since shipped and the client no longer calls either
-- one. Verified before dropping: zero references anywhere in the repo outside
-- migration text and the generated database.types.ts — no src/, no
-- supabase/functions/, no supabase/legacy/, no scripts.
--
-- Why they're worth removing rather than leaving dormant: both were revoked
-- from public/anon only, so `authenticated` still held EXECUTE on them
-- (confirmed live via has_function_privilege). bulk_deal_order in particular
-- still wrote an appointment row and decremented available_quota — live,
-- reachable write surface implementing a model the app abandoned, and one
-- that bypasses every guard the campaign model added (pledge/deposit
-- lifecycle, OWNER_CANNOT_PLEDGE, the closed-campaign checks, and the quota
-- rules rewritten in 20260920).
--
-- bulk_deals.available_quota is deliberately NOT dropped — the campaign model
-- still uses that column as its pool cap (see 20260920).
-- ============================================================

drop function if exists public.bulk_deal_order(text, integer, text, text, text, text);
drop function if exists public.bulk_deal_quote(text, integer);
