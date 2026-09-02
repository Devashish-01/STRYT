-- ============================================================
-- 20260901 — Add the fulfillment_type column 20260900 assumed existed
--
-- Bug in 20260900_bulk_deal_campaigns.sql: bulk_deal_pledge_join() reads
-- v_deal.fulfillment_type (to decide whether a delivery address is
-- required), but that migration never actually added the column to
-- bulk_deals — the old instant-order model let the CUSTOMER pick
-- fulfillment per order (bulk_deal_order's p_fulfillment param) rather than
-- the deal carrying one. The campaign model needs it on the deal itself,
-- chosen once at creation, same as requests.fulfillment_type already works
-- for group buys — same column name, same type, same check constraint, so
-- FULFILLMENT_LABELS (src/types/bulk.ts) covers both without a branch.
-- ============================================================

alter table public.bulk_deals
  add column if not exists fulfillment_type text
    check (fulfillment_type is null or fulfillment_type in
      ('ON_SITE_CAMP','CLINIC_VISIT','STORE_PICKUP','CENTRAL_DROP','DOORSTEP'));
