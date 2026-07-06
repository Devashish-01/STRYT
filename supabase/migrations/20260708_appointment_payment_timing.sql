-- 20260708 — Flow 2 payment-system hardening, per explicit spec:
--
-- 1. Cash claims must ALSO be verified by the business/provider — the old
--    "cash = instant PAID" shortcut let a customer self-declare cash payment
--    with zero chance for the seller to dispute a false claim, same class of
--    bug just fixed for agreements. Both methods now require confirmation.
--    (No schema change needed — appointments.payment_status already exists;
--    the fix is in appointmentService.claimPayment, client-side.)
--
-- 2. Seller-configurable payment timing: collect payment AT_BOOKING (before
--    the seller even accepts) or AT_APPOINTMENT (current default — accept
--    first, pay around/after service). New column on both businesses and
--    providers, defaulting to the existing behavior so nobody's flow changes
--    unless they explicitly opt in.

alter table if exists public.businesses
  add column if not exists payment_timing text not null default 'AT_APPOINTMENT';

alter table if exists public.providers
  add column if not exists payment_timing text not null default 'AT_APPOINTMENT';

comment on column public.businesses.payment_timing is
  'AT_BOOKING (pay before accept) | AT_APPOINTMENT (accept first, pay around service — default)';
comment on column public.providers.payment_timing is
  'AT_BOOKING (pay before accept) | AT_APPOINTMENT (accept first, pay around service — default)';
