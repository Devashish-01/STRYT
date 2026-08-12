-- Two findings from the first real run of `npm run check-policy-grants`
-- (the guard added with 20260887). Both changes only ever REMOVE access —
-- nothing here widens what any role can read.
--
-- ── 1. Four more {public} policies that abort for anon ──────────────────────
-- Same class as 20260887: a policy applying to PUBLIC whose qual calls a
-- function anon cannot EXECUTE. Postgres resolves EXECUTE at executor init,
-- so the statement aborts outright instead of returning an empty set.
--
-- Confirmed live as anon (401, "permission denied for function
-- has_business_scope"):
--     appointments, appointment_deliveries, delivery_batches, delivery_agent_duty
--
-- These are authenticated-only features — bookings, delivery runs and agent
-- duty state are meaningless without a session, and anon was never intended to
-- read them. Scoping the policies to `authenticated` means anon simply has no
-- applicable policy (clean empty result) rather than a hard 401, and lets
-- has_business_scope / has_business_full_access STAY REVOKED from anon.
--
-- No access change: anon could not read these rows before and cannot now.
--
-- Deliberately NOT touched — verified working for anon (200) despite being
-- flagged by the guard: catalog_items, queue_tokens, queue_settings,
-- business_qna, business_portfolio_items, loyalty_cards, post_comments,
-- profile_deletion_requests. Guests legitimately read shop menus and queue
-- state, so those policies are left exactly as they are.

do $$ begin
  alter policy appt_select on public.appointments to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  alter policy appt_insert on public.appointments to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  alter policy appt_update on public.appointments to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  alter policy appointment_deliveries_select on public.appointment_deliveries to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  alter policy delivery_batches_select on public.delivery_batches to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  alter policy delivery_agent_duty_select on public.delivery_agent_duty to authenticated;
exception when undefined_object then null; end $$;


-- ── 2. society_members.mem_read leaked every society's member list ──────────
-- The live qual contained a self-comparison:
--
--   OR EXISTS (SELECT 1 FROM society_members sm
--              WHERE sm.society_id = sm.society_id      -- <-- always TRUE
--                AND sm.user_id = auth.uid()
--                AND sm.approved = true)
--
-- `sm.society_id = sm.society_id` is a tautology, so the branch collapsed to
-- "am I an approved member of ANY society?" — and if so, the row was visible
-- regardless of which society it belonged to. Effect: any approved member of
-- one society could read the member list (user ids) of EVERY society.
--
-- The branch was also redundant. The final branch already does the correct
-- per-society check via is_society_member(society_id, auth.uid()), which is
-- SECURITY DEFINER precisely so it can query society_members without
-- recursing into this policy. Dropping the broken EXISTS therefore removes the
-- leak while changing nothing for a legitimate member: they still match either
-- `user_id = auth.uid()` (their own row) or is_society_member(...) (a society
-- they actually belong to).
--
-- ALTER POLICY ... USING changes only the expression — roles (already
-- {authenticated} after 20260887) and cmd are untouched.

do $$ begin
  alter policy mem_read on public.society_members
    using (
      ((select auth.uid())::text = user_id)
      or public.is_society_member(society_id, (select auth.uid())::text)
    );
exception when undefined_object then null; end $$;


-- ── Verify after applying ───────────────────────────────────────────────────
--   npm run check-policy-grants     -- appointments/delivery rows gone
--
--   begin;
--     set local role anon;
--     select count(*) from public.businesses;    -- still works
--     select count(*) from public.catalog_items; -- still works
--     select count(*) from public.appointments;  -- now 0 rows, NOT an error
--   rollback;
--
-- And as an authenticated member of society A: selecting society_members must
-- return rows for A only, never for society B.
