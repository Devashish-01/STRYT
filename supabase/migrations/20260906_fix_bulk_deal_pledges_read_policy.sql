-- ============================================================
-- 20260906 — Fix read_bulk_deal_pledges: is_admin() has no zero-arg overload
--
-- 20260900's read_bulk_deal_pledges policy calls public.is_admin() with NO
-- arguments. The only is_admin ever defined in a tracked migration is
-- is_admin(p_user_id text) (20260713_critical_security_fixes.sql) — every
-- other policy in this codebase calls it as is_admin(auth.uid()::text).
-- A zero-arg is_admin() exists live in the DB (confirmed via pg_proc) but
-- isn't in any migration file — it's the same untracked helper documented
-- in 20260887_restore_rls_helper_grants.sql, which explicitly granted it
-- EXECUTE on anon+authenticated back on 2026-08-11 for guest browsing. So
-- the exact mechanism of the 403 seen on bulkService.enrichMyPledges isn't
-- fully pinned down by grants alone (20260887's grant should cover this
-- case too) — but this is still the right fix regardless: 20260887's own
-- header lists THREE prior outages caused by RLS policies calling helper
-- functions that later lost or never had the right grant/scope, and this
-- undocumented zero-arg overload is exactly the kind of drift that pattern
-- warns about. Every other policy in this codebase calls the real, tracked,
-- known-good is_admin(text) — this migration does the same, removing the
-- dependency on an untracked function instead of trying to reason about its
-- exact current grant state. check-policy-grants.mjs is the empirical way
-- to confirm this (and anything else like it) against the live DB.
--
-- Safe to rerun — drops and recreates a single policy, no data touched.
-- ============================================================

drop policy if exists read_bulk_deal_pledges on public.bulk_deal_pledges;

create policy read_bulk_deal_pledges on public.bulk_deal_pledges for select
  using (
    user_id = (auth.uid())::text
    or exists (
      select 1 from public.bulk_deals d
       where d.id = deal_id and public.has_business_access(d.business_id, (auth.uid())::text)
    )
    or public.is_admin((auth.uid())::text)
  );
