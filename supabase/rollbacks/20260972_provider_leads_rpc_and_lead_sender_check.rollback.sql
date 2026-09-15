-- Rollback for 20260972_provider_leads_rpc_and_lead_sender_check.sql
--
-- ins_leads WITH CHECK copied by script from pg_policies on production (2026-09-15), not retyped.
-- Only safe while no shipped app calls provider_leads() (the leads inbox would break).
-- ⚠ Re-opens leads sent in another user's name.

ALTER POLICY ins_leads ON public.leads
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop function if exists public.provider_leads(text);

notify pgrst, 'reload schema';
