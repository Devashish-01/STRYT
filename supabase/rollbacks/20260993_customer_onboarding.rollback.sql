-- Roll back the client first. Retain acceptance evidence and progress for recovery.
-- Intentionally do not delete the audit columns, their index, or onboarding rows.
begin;
drop function if exists public.customer_onboarding(text, jsonb);
drop function if exists public.record_login_acceptance(text, uuid, text);
notify pgrst, 'reload schema';
commit;
