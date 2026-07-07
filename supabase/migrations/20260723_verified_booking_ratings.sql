-- Flow 9 (Reputation & Social) — "verified booking" tag on ratings: proves a
-- review came from someone with a real completed appointment, not just a
-- follow-swap. Stamped client-side at review-submit time (checked against
-- appointments, which store target_type/target_id directly on the listing —
-- agreements only store a responder USER id, so they can't be joined to a
-- business/provider listing id without an extra ownership lookup).
-- Run manually in Supabase SQL editor.

alter table if exists public.ratings
  add column if not exists is_verified_booking boolean not null default false;
