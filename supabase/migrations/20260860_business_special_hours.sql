-- Special/holiday hours entries (e.g. "Holi (14 Mar) — Closed") were being
-- collected in HoursEditor.tsx's local React state but never sent anywhere to
-- persist — there was no column to write them to. This adds one, mirroring
-- the existing free-text `hours` column: an array of {date, note} objects.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as `business_special_hours`.
alter table public.businesses
  add column if not exists special_hours jsonb;

comment on column public.businesses.special_hours is
  'Array of {date, note} entries for one-off/holiday hours overrides, e.g. [{"date":"Holi (14 Mar)","note":"Closed"}]. Null/empty = no overrides.';
