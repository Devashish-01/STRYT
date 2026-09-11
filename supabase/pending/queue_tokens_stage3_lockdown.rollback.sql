-- Rollback for queue_tokens_stage3_lockdown.sql
--
-- Restores queue_tokens exactly as it was before stage 3. Both statements below
-- are copied VERBATIM by script from supabase/snapshots/2026-09-11_pre_reconcile.sql
-- (sha256 32981438de83325f9275e5909a52328f8765e78e722c182f7f4bf076aec060c5),
-- not retyped.
--
-- ⚠ This re-opens the hole: anyone, including guests, can read every token.
-- Only use it if stage 3 breaks something and a fix isn't immediate.

drop policy if exists queue_tokens_select_participants on public.queue_tokens;

CREATE POLICY queue_tokens_select_all ON public.queue_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((true OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((customer_user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = queue_tokens.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR can_manage_business(business_id)))));

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.queue_tokens TO anon;

notify pgrst, 'reload schema';
