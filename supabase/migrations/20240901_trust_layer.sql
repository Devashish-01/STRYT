-- Migration: Trust Layer Support
-- Date: 2024-09-01

-- New tables
CREATE TABLE IF NOT EXISTS public.provider_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('PAN','AADHAAR','BACKGROUND')),
  doc_url text,
  verified_name text,
  verified_dob text,
  api_response jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tracking_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id text NOT NULL REFERENCES public.agreements(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id text NOT NULL REFERENCES public.agreements(id),
  triggered_by_user_id text NOT NULL REFERENCES public.users(id),
  provider_user_id text NOT NULL REFERENCES public.users(id),
  lat double precision,
  lng double precision,
  emergency_contact text,
  emergency_contact_name text,
  sms_sent boolean DEFAULT false,
  admin_notified boolean DEFAULT false,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- New columns on existing tables
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text;

ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS provider_lat double precision,
  ADD COLUMN IF NOT EXISTS provider_lng double precision,
  ADD COLUMN IF NOT EXISTS live_status text DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS tracking_token uuid REFERENCES public.tracking_tokens(id);

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS verification_tier text NOT NULL DEFAULT 'NONE';

-- RLS
ALTER TABLE public.provider_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- provider_verifications: provider can read/write their own rows
CREATE POLICY pv_self ON public.provider_verifications
  USING (auth.uid()::text = (SELECT user_id FROM public.providers WHERE id = provider_id));
CREATE POLICY pv_insert ON public.provider_verifications FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT user_id FROM public.providers WHERE id = provider_id));

-- tracking_tokens: public read (for the share link), party insert
CREATE POLICY tt_read ON public.tracking_tokens FOR SELECT USING (true);
CREATE POLICY tt_insert ON public.tracking_tokens FOR INSERT
  WITH CHECK (auth.uid()::text IN (
    SELECT requester_user_id FROM public.agreements WHERE id = agreement_id
    UNION
    SELECT responder_user_id FROM public.agreements WHERE id = agreement_id
  ));

-- sos_alerts: own rows only
CREATE POLICY sos_self ON public.sos_alerts
  USING (auth.uid()::text = triggered_by_user_id);
CREATE POLICY sos_insert ON public.sos_alerts FOR INSERT
  WITH CHECK (auth.uid()::text = triggered_by_user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pv_provider ON public.provider_verifications(provider_id);
CREATE INDEX IF NOT EXISTS idx_tt_agreement ON public.tracking_tokens(agreement_id);
CREATE INDEX IF NOT EXISTS idx_sos_agreement ON public.sos_alerts(agreement_id);
