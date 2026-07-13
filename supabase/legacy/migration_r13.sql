-- ============================================================
-- NAYA — R13: Map & Verification
-- Run AFTER migration_r12.sql. Safe to re-run.
-- ============================================================

-- ── 1. SCHEMA CHANGES FOR VERIFICATION ───────────────────────
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'NONE';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS verification_document_url text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'NONE';
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS verification_document_url text;

-- Add check constraints to enforce valid status values
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_verification_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_verification_status_check CHECK (verification_status IN ('NONE', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'));

ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_verification_status_check;
ALTER TABLE public.providers ADD CONSTRAINT providers_verification_status_check CHECK (verification_status IN ('NONE', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'));

-- Update existing verified businesses/providers to APPROVED status
UPDATE public.businesses SET verification_status = 'APPROVED' WHERE is_verified = true;
UPDATE public.providers SET verification_status = 'APPROVED' WHERE is_verified = true;

-- ── 2. TRIGGER TO KEEP IS_VERIFIED IN SYNC WITH STATUS ────────
CREATE OR REPLACE FUNCTION public.sync_is_verified() RETURNS trigger AS $$
BEGIN
  IF NEW.verification_status = 'APPROVED' THEN
    NEW.is_verified := true;
  ELSE
    NEW.is_verified := false;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_businesses_verified ON public.businesses;
CREATE TRIGGER sync_businesses_verified BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_verified();

DROP TRIGGER IF EXISTS sync_providers_verified ON public.providers;
CREATE TRIGGER sync_providers_verified BEFORE INSERT OR UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_verified();

-- ── 3. STORAGE BUCKET CONFIGURATION ──────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects 
  FOR SELECT USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Authenticated Insert" ON storage.objects;
CREATE POLICY "Authenticated Insert" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');
