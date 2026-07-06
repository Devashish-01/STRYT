-- 20260707 — bring agreement (deal) payments in line with the appointment
-- payment flow, which already does this correctly.
--
-- Root gap: `payments`/escrow (migration_launch_hardening.sql) is dead code —
-- it's written only by a Razorpay Edge Function that was never deployed, so
-- it never actually holds/releases anything today. The REAL payment step for
-- a deal was `markDepositPaid`: the requester taps one button and the
-- agreement instantly flips to DEPOSIT_PAID — no chance for the responder to
-- confirm they actually received it, unlike appointments (claimPayment →
-- PENDING_CONFIRM → confirmPayment/rejectPaymentClaim). This migration adds
-- the same claim/confirm/reject columns to `agreements` so the UI can reuse
-- the identical, already-proven two-sided pattern instead of a one-sided
-- self-report.

alter table if exists public.agreements
  add column if not exists payment_status text not null default 'UNPAID',
  add column if not exists payment_method text,
  add column if not exists payment_amount int,
  add column if not exists payment_reference text;

-- UNPAID | PENDING_CONFIRM | PAID | REJECTED — same vocabulary as
-- appointments.payment_status (types/console.ts PaymentStatus), so both
-- flows can share one client-side type instead of drifting apart.
comment on column public.agreements.payment_status is
  'UNPAID | PENDING_CONFIRM | PAID | REJECTED — mirrors appointments.payment_status';

-- ── Confirmation nudge ───────────────────────────────────────────────────────
-- The `notifications` table has NO insert policy for regular users (every
-- existing notification in this app is written by a SECURITY DEFINER trigger
-- — see notify_on_request, notify_on_agreement, etc.). A plain client-side
-- `insert()` here would be silently rejected by RLS. This narrow RPC lets a
-- confirming party notify the *other* party on their own agreement — nothing
-- broader — mirroring that same established pattern instead of widening RLS.
create or replace function public.notify_agreement_confirm(
  p_agreement_id text,
  p_recipient_user_id text
)
returns void as $$
declare
  req_id text;
  resp_id text;
begin
  select requester_user_id, responder_user_id into req_id, resp_id
    from public.agreements where id = p_agreement_id;

  -- Caller must be a party to this agreement, and the recipient must be the
  -- OTHER party — prevents notifying an arbitrary user id.
  if auth.uid()::text not in (req_id, resp_id) then
    raise exception 'Not a party to this agreement';
  end if;
  if p_recipient_user_id not in (req_id, resp_id) or p_recipient_user_id = auth.uid()::text then
    raise exception 'Recipient must be the other party';
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    p_recipient_user_id,
    'AGREEMENT',
    'Confirm within 10 minutes',
    'The other side confirmed — confirm now or this agreement will auto-cancel.',
    '/agreement/' || p_agreement_id
  );
end;
$$ language plpgsql security definer;
