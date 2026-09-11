-- queue_tokens lockdown — stage 3 of 3.  DRAFT: NOT APPLIED.
--
-- ⚠ DO NOT APPLY until the stage 2 app update is live for your users:
--   the build where businessService.queue()/myQueues() use queue_waiting_line()
--   and BusinessDetail live-updates from queue_settings (see migration 20260957).
--   Older installs read other customers' tokens directly; once this runs they
--   show an empty line ("0 ahead") on the business page and in My Queues.
--
-- To apply: move this file into supabase/migrations/ with the next free number,
-- move queue_tokens_stage3_lockdown.rollback.sql into supabase/rollbacks/ under
-- the same name, and follow the rules in supabase/APPLY_LOG.md.
--
-- WHAT:
--   1. Replace queue_tokens_select_all — USING ((true OR …)), i.e. readable by
--      anyone — with a participants-only rule: the customer who owns the token,
--      or the owner of the business. Team members keep access through the
--      existing delegated_access_queue_tokens policy, which requires the
--      'queue' scope. (The old rule's can_manage_business() branch let ANY team
--      member read, whatever their scope — the over-grant 20260829 closed
--      everywhere else.)
--   2. Revoke every table privilege on queue_tokens from anon. Guests no longer
--      touch tokens; close_stale_queue_tokens() is SECURITY DEFINER, so the
--      guests' opportunistic cleanup call keeps working.
--
-- Checked against the 2026-09-11 snapshot: walk-in tokens carry the owner's
-- own id as customer_user_id, so they stay visible; insert-returning reads by
-- customers stay visible through the first branch.

drop policy if exists queue_tokens_select_all on public.queue_tokens;

create policy queue_tokens_select_participants on public.queue_tokens
  for select to authenticated
  using (
    customer_user_id = (select auth.uid())::text
    or exists (
      select 1 from public.businesses b
       where b.id = queue_tokens.business_id
         and b.owner_user_id = (select auth.uid())::text
    )
  );

revoke all on table public.queue_tokens from anon;

notify pgrst, 'reload schema';
