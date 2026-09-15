-- Migration: 20260966_column_level_pii_lockdown.sql
-- Description: Column-level SELECT privilege lockdown for sensitive columns (P05 Step 5.C)
-- 1. Protect business_login_credentials.password_hash from direct PostgREST/client SELECT
-- 2. Protect appointment_deliveries.handoff_code from direct PostgREST/client SELECT

-- 1. Lockdown business_login_credentials: revoke whole-table SELECT and grant non-sensitive columns
REVOKE SELECT ON public.business_login_credentials FROM public, anon, authenticated;
GRANT SELECT (
  business_id,
  login_id,
  require_approval,
  session_hours,
  is_enabled,
  created_at,
  updated_at
) ON public.business_login_credentials TO authenticated;

-- 2. Lockdown appointment_deliveries: revoke whole-table SELECT and grant non-sensitive columns
REVOKE SELECT ON public.appointment_deliveries FROM public, anon, authenticated;
GRANT SELECT (
  id,
  appointment_id,
  business_id,
  agent_user_id,
  status,
  handoff_verified,
  lat,
  lng,
  live_status,
  created_at,
  delivered_at,
  batch_id,
  stop_order,
  cancelled_at,
  cancelled_by,
  cancel_reason,
  cancel_note
) ON public.appointment_deliveries TO authenticated;
