-- Migration 20260970 — customers change their bookings only through the booking functions.
--
-- WHY
--   Policy appt_update let the customer UPDATE any column of their own booking directly.
--   Tested on production 2026-09-15 inside a forced rollback: a customer set their own
--   booking to payment_status = PAID, to status = COMPLETED, and package_price = 1.
--   The customer's real actions — cancel (appointment_transition), reschedule
--   (reschedule_appointment), claim a payment (appointment_claim_payment) — are all
--   SECURITY DEFINER functions owned by `postgres` (BYPASSRLS), so they don't need this
--   policy. The only direct UPDATE in the app is setUnpaidAmount, done by the owner/staff.
--
-- WHAT
--   Same policy, minus the customer branch. Owner (target_owner_user_id) and business
--   staff with the 'appointments' scope keep direct UPDATE.

alter policy appt_update on public.appointments
  using (
    ((( select auth.uid() as uid))::text = target_owner_user_id)
    or ((target_type = 'BUSINESS'::text) and has_business_scope(target_id, (( select auth.uid() as uid))::text, 'appointments'::text))
  )
  with check (
    ((( select auth.uid() as uid))::text = target_owner_user_id)
    or ((target_type = 'BUSINESS'::text) and has_business_scope(target_id, (( select auth.uid() as uid))::text, 'appointments'::text))
  );

notify pgrst, 'reload schema';
