-- ============================================================
-- NAYA — R12: admin & moderation
-- Run AFTER migration_r11.sql. Safe to re-run.
-- ============================================================

-- ── 1. SCHEMA CHANGES FOR CATEGORIES & ENTITIES ──────────────
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS status entity_status DEFAULT 'PENDING';
-- Make pre-existing categories active so they remain visible
UPDATE public.categories SET status = 'ACTIVE' WHERE status IS NULL;

-- Add rejection_reason columns for moderation tracking
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS rejection_reason text;

-- ── 2. REPORTS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id               text PRIMARY KEY DEFAULT ('rp_' || replace(gen_random_uuid()::text, '-', '')),
  target_type      text NOT NULL, -- BUSINESS | PROVIDER | REQUEST
  target_id        text NOT NULL,
  target_name      text NOT NULL,
  reason           text NOT NULL, -- SPAM | SCAM | OFFENSIVE | FAKE | WRONG_CATEGORY | OTHER
  details          text DEFAULT '',
  reporter_user_id text REFERENCES public.users(id),
  status           text NOT NULL DEFAULT 'OPEN', -- OPEN | REVIEWING | ACTION_TAKEN | DISMISSED
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT reports_status_check CHECK (status IN ('OPEN', 'REVIEWING', 'ACTION_TAKEN', 'DISMISSED'))
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status, created_at DESC);

-- ── 3. RLS POLICIES FOR CATEGORIES ─────────────────────────────
DROP POLICY IF EXISTS read_categories ON public.categories;
CREATE POLICY read_categories ON public.categories
  FOR SELECT USING (
    status = 'ACTIVE' OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

DROP POLICY IF EXISTS update_categories_admin ON public.categories;
CREATE POLICY update_categories_admin ON public.categories
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

-- ── 4. RLS POLICIES FOR REPORTS ───────────────────────────────
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ins_reports ON public.reports;
CREATE POLICY ins_reports ON public.reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS admin_read_reports ON public.reports;
CREATE POLICY admin_read_reports ON public.reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

DROP POLICY IF EXISTS admin_upd_reports ON public.reports;
CREATE POLICY admin_upd_reports ON public.reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

-- ── 5. RLS POLICIES FOR BUSINESSES & PROVIDERS (READ PATH) ────
DROP POLICY IF EXISTS read_businesses ON public.businesses;
CREATE POLICY read_businesses ON public.businesses
  FOR SELECT USING (
    status = 'ACTIVE'
    OR owner_user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

DROP POLICY IF EXISTS read_providers ON public.providers;
CREATE POLICY read_providers ON public.providers
  FOR SELECT USING (
    status = 'ACTIVE'
    OR user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text AND 'admin' = ANY(u.roles)
    )
  );

-- ── 6. SEED DEVELOPER ADMIN USER ──────────────────────────────
UPDATE public.users SET roles = array_append(roles, 'admin') 
WHERE id = 'u1' AND NOT ('admin' = ANY(roles));
