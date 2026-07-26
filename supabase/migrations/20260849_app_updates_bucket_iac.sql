-- app-updates Storage bucket — infrastructure-as-code catch-up.
--
-- This bucket already exists live (created out-of-band via the Supabase
-- dashboard, remote migration history shows it as "app_updates_bucket" —
-- there was never a corresponding file in this repo). This migration exists
-- so the bucket is reproducible from `supabase/migrations/` like every other
-- piece of this project's infrastructure, not just tribal knowledge.
--
-- Holds exactly two kinds of object, both written only by the OTA publish/
-- rollback scripts (scripts/publish-ota-update.mjs, scripts/rollback-ota-update.mjs)
-- via the service-role key, which bypasses RLS — so no INSERT/UPDATE policy
-- is needed here:
--   bundle-<version>.zip   — one immutable object per published version
--   latest.json            — the manifest pointer, the only object ever overwritten
--
-- Public bucket: objects are served directly via their public URL by Storage's
-- CDN path, which doesn't consult storage.objects RLS — so no SELECT policy is
-- added either. (20260827_security_advisor_hardening.sql already dropped this
-- bucket's old broad "Public read app-updates" SELECT policy for exactly this
-- reason — it only mattered for `.list()` enumeration, which nothing calls.)
insert into storage.buckets (id, name, public)
values ('app-updates', 'app-updates', true)
on conflict (id) do nothing;
