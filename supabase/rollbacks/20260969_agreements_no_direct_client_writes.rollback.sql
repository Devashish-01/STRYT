-- Rollback for 20260969_agreements_no_direct_client_writes.sql
--
-- Policy text copied by script from pg_policies on production (2026-09-15), not retyped.
-- ⚠ Re-opens direct agreement edits and deletes by either party.

CREATE POLICY write_agreements ON public.agreements AS PERMISSIVE FOR ALL TO public
  USING (((requester_user_id = (( SELECT auth.uid() AS uid))::text) OR (responder_user_id = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((requester_user_id = (( SELECT auth.uid() AS uid))::text) OR (responder_user_id = (( SELECT auth.uid() AS uid))::text)));

notify pgrst, 'reload schema';
