-- ============================================================
-- Payment System Migration
-- Run manually in Supabase SQL editor.
-- ============================================================

-- Payment fields on appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_method  TEXT,                               -- 'UPI' | 'CASH'
  ADD COLUMN IF NOT EXISTS payment_status  TEXT NOT NULL DEFAULT 'UNPAID',     -- 'UNPAID' | 'PAID'
  ADD COLUMN IF NOT EXISTS payment_amount  NUMERIC(10,2),                      -- from package price or manual
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;                             -- optional UPI txn ID entered by customer

-- UPI VPA on businesses (owner sets this in BusinessSettings)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS upi_id TEXT;
