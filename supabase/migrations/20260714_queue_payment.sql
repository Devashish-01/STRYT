-- ============================================================
-- Flow 3 (Live Queue) payment support.
-- Run manually in Supabase SQL editor.
--
-- Queue tokens have no catalog price at join time (unlike appointments'
-- package price or agreements' proposal price), so the amount is always
-- entered freeform by the customer when claiming. Both CASH and UPI
-- require business verification (same claim -> confirm/reject cycle as
-- appointments.payment_status / agreements.payment_status).
-- ============================================================

alter table if exists public.queue_tokens
  add column if not exists payment_status text not null default 'UNPAID',
  add column if not exists payment_method text,
  add column if not exists payment_amount int,
  add column if not exists payment_reference text;

comment on column public.queue_tokens.payment_status is
  'UNPAID | PENDING_CONFIRM | PAID | REJECTED — mirrors appointments.payment_status';
