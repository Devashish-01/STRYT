-- ============================================================
-- NAYA — Phase 2: Supply Onboarding & Storage Pipeline
-- Run against your Supabase project. Safe to re-run.
-- ============================================================

-- ── 1. broadcast_radius on businesses ──────────────────────
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS broadcast_radius int DEFAULT 5;

-- ── 2. User-scoped storage RLS (replaces permissive insert) ─
DROP POLICY IF EXISTS "Authenticated Insert" ON storage.objects;

DROP POLICY IF EXISTS "Users upload to own folder" ON storage.objects;
CREATE POLICY "Users upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'uploads'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own files" ON storage.objects;
CREATE POLICY "Users update own files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own files" ON storage.objects;
CREATE POLICY "Users delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
