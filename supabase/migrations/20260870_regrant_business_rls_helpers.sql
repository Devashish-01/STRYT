-- Idempotent re-grant for business RLS helper functions.
-- Without these EXECUTE grants, owners cannot UPDATE businesses (open now,
-- accepting appointments, settings) — Postgres aborts with:
--   permission denied for function has_business_full_access
-- See 20260842_grant_business_scope_helpers.sql

GRANT EXECUTE ON FUNCTION public.has_business_full_access(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_business_scope(text, text, text) TO authenticated, anon;
