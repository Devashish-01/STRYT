-- Migration: 20260964_drop_obsolete_bulk_deal_token_redeem.sql
-- Description: Drop obsolete 1-argument bulk_deal_token_redeem(text) overload.
-- The 2-argument overload bulk_deal_token_redeem(text, text DEFAULT NULL) supersedes it
-- with BLK-5 cross-store protection and default parameter support.

DROP FUNCTION IF EXISTS public.bulk_deal_token_redeem(text);
