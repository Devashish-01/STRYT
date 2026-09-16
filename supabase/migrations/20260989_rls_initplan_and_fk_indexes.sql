-- 20260989_rls_initplan_and_fk_indexes
--
-- P11.D, performance only — no policy's logic changes, and no row changes who can see it.
--
-- 1. Nine policies called auth.uid() unwrapped, so Postgres re-evaluated it per row instead of once per statement
--    (advisor: auth_rls_initplan). Wrapping it as (select auth.uid()) makes it an InitPlan, evaluated once. Written as
--    `alter policy`, not drop/create, so the command, the roles and the permissive/restrictive setting cannot drift —
--    only the expressions are touched, and each one is the live definition with `auth.uid()` wrapped, nothing else.
--
-- 2. Four foreign keys had no covering index (advisor: unindexed_foreign_keys), which makes a delete of the referenced
--    user scan the child table. Plain `create index`, not `create index concurrently`: the Management API runs a
--    migration inside a transaction, where CONCURRENTLY is not allowed. These four tables hold single-digit row counts
--    today (bulk_deals: 1 on staging), so the brief ACCESS EXCLUSIVE lock costs nothing; revisit if they grow large
--    before a later index is added.
--
-- Rollback: supabase/rollbacks/20260989_rls_initplan_and_fk_indexes.rollback.sql

-- ── 1. auth.uid() evaluated once per statement ───────────────────────────────

alter policy read_bulk_deal_pledges on public.bulk_deal_pledges
  using (
    (user_id = ((select auth.uid()))::text)
    OR (EXISTS ( SELECT 1
       FROM bulk_deals d
      WHERE ((d.id = bulk_deal_pledges.deal_id) AND has_business_access(d.business_id, ((select auth.uid()))::text))))
    OR is_admin(((select auth.uid()))::text)
  );

alter policy read_bulk_deal_tokens on public.bulk_deal_tokens
  using (
    (holder_user_id = ((select auth.uid()))::text)
    OR (issuer_user_id = ((select auth.uid()))::text)
    OR ((business_id IS NOT NULL) AND has_business_access(business_id, ((select auth.uid()))::text))
    OR is_admin(((select auth.uid()))::text)
  );

alter policy read_bulk_deals on public.bulk_deals
  using (
    (status = 'ACTIVE'::entity_status)
    OR (owner_user_id = ((select auth.uid()))::text)
    OR is_admin()
  );

alter policy select_custom_payments on public.custom_payments
  using (
    (((select auth.uid()))::text = payer_user_id)
    OR (((select auth.uid()))::text = target_owner_user_id)
    OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, ((select auth.uid()))::text, 'appointments'::text))
    OR is_admin()
  );

alter policy read_group_buy_tokens on public.group_buy_tokens
  using (
    (holder_user_id = ((select auth.uid()))::text)
    OR (issuer_user_id = ((select auth.uid()))::text)
    OR is_admin()
  );

alter policy insert_places on public.places
  with check (
    (submitted_by_user_id = ((select auth.uid()))::text)
    AND ((status = 'PENDING'::entity_status) OR is_admin())
  );

alter policy select_places on public.places
  using (
    (status = 'ACTIVE'::entity_status)
    OR (submitted_by_user_id = ((select auth.uid()))::text)
    OR is_admin()
  );

alter policy update_places_owner on public.places
  using (submitted_by_user_id = ((select auth.uid()))::text)
  with check (submitted_by_user_id = ((select auth.uid()))::text);

alter policy upd_ratings on public.ratings
  using (rater_user_id = ((select auth.uid()))::text)
  with check (rater_user_id = ((select auth.uid()))::text);

-- ── 2. Covering indexes for the four unindexed foreign keys ──────────────────

create index if not exists bulk_deal_tokens_holder_idx on public.bulk_deal_tokens (holder_user_id);
create index if not exists bulk_deal_tokens_issuer_idx on public.bulk_deal_tokens (issuer_user_id);
create index if not exists bulk_deals_owner_idx        on public.bulk_deals (owner_user_id);
create index if not exists group_buy_tokens_issuer_idx on public.group_buy_tokens (issuer_user_id);
