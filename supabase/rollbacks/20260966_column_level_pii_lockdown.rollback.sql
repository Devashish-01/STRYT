-- Rollback for 20260966_column_level_pii_lockdown.sql
-- Description: Restore whole-table SELECT grants on business_login_credentials and appointment_deliveries

REVOKE SELECT ON public.business_login_credentials FROM authenticated;
GRANT SELECT ON public.business_login_credentials TO authenticated;

REVOKE SELECT ON public.appointment_deliveries FROM authenticated;
GRANT SELECT ON public.appointment_deliveries TO anon, authenticated;
