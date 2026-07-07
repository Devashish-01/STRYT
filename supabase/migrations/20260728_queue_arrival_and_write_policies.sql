-- ============================================================
-- Queue: arrival tracking + explicit write RLS policies. Run manually in
-- Supabase SQL editor.
--
-- queue_tokens has never had an INSERT/UPDATE policy in a tracked migration
-- (only the SELECT policy from 20260713_critical_security_fixes.sql is
-- committed) even though join/leave/call/serve/pay-claim/confirm/reject all
-- do plain client-side writes (businessService.ts). Whatever is live today
-- may only exist because it was hand-added in Supabase Studio. This migration
-- makes those policies explicit and idempotent, mirroring the same
-- customer-or-business-owner check already used for read_queue_tokens.
-- ============================================================

alter table public.queue_tokens
  add column if not exists arrived_at timestamptz;

comment on column public.queue_tokens.arrived_at is
  'Set when the business confirms the called customer has physically shown up — independent of status=SERVED, so a no-show can be told apart from a completed visit.';

do $$ begin
  drop policy if exists insert_own_queue_token on public.queue_tokens;
  create policy insert_own_queue_token on public.queue_tokens
    for insert with check (
      auth.role() = 'authenticated'
      and customer_user_id = auth.uid()::text
    );

  drop policy if exists update_queue_token on public.queue_tokens;
  create policy update_queue_token on public.queue_tokens
    for update using (
      auth.role() = 'authenticated'
      and (
        customer_user_id = auth.uid()::text
        or exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()::text)
      )
    );
exception when duplicate_object then null; end $$;
