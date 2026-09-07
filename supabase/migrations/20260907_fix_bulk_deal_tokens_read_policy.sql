-- ============================================================
-- 20260907 — Fix read_bulk_deal_tokens: same is_admin() zero-arg bug as #0
--
-- 20260900_bulk_deal_campaigns.sql:115 has the identical zero-arg
-- public.is_admin() call fixed for read_bulk_deal_pledges in 20260906 — see
-- that file for the full reasoning on why this untracked helper is worth
-- moving off regardless of its exact current grant state. Same consequence
-- here: every SELECT on bulk_deal_tokens (including a holder reading their
-- own claim pass via bulkService's direct .from("bulk_deal_tokens") read)
-- is at risk of failing with 403 if this helper's grant/scope ever drifts
-- again, same as it has three times before per 20260887's header.
--
-- Fix: same pattern as 20260906 — drop and recreate, call is_admin(text).
-- Safe to rerun — no data touched.
-- ============================================================

drop policy if exists read_bulk_deal_tokens on public.bulk_deal_tokens;

create policy read_bulk_deal_tokens on public.bulk_deal_tokens for select
  using (
    holder_user_id = (auth.uid())::text
    or issuer_user_id = (auth.uid())::text
    or (business_id is not null and public.has_business_access(business_id, (auth.uid())::text))
    or public.is_admin((auth.uid())::text)
  );
