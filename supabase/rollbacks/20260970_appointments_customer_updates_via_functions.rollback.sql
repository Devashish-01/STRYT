-- Rollback for 20260970_appointments_customer_updates_via_functions.sql
--
-- Policy text copied by script from pg_policies on production (2026-09-15), not retyped.
-- ⚠ Re-opens direct customer edits of their own bookings (PAID, COMPLETED, price).

ALTER POLICY appt_update ON public.appointments
  USING ((((( SELECT auth.uid() AS uid))::text = customer_user_id) OR ((( SELECT auth.uid() AS uid))::text = target_owner_user_id) OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text))))
  WITH CHECK ((((( SELECT auth.uid() AS uid))::text = customer_user_id) OR ((( SELECT auth.uid() AS uid))::text = target_owner_user_id) OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text))));

notify pgrst, 'reload schema';
