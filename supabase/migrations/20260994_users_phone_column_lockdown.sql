-- users.phone lockdown — follow-up to 20260968. Promoted from supabase/pending/ on 2026-09-20.
--
-- The release gate this file carried has been CHECKED AND MET (2026-09-20). Evidence:
--
--   1. Published OTA manifest `app-updates/latest.json` → version 1.0.68,
--      bundle-1.0.68.zip, sha256 8a3878ddf19fdc59ef83f1a848ac9adece850c6cb74465cda0c78fedab96597a.
--      The downloaded zip's checksum matched the manifest, so this is the bundle users actually run.
--   2. Inside that bundle: "provider_leads" is present (1 occurrence, assets/index-CjgRFLEM.js).
--   3. The forbidden shape `users!from_user_id(name, alias, avatar, phone` is GONE. The only
--      remaining embeds are `users!from_user_id(name, avatar)` x2 — no phone column.
--   4. Wider check of the same bundle: zero matches for any `users…(…phone…)` embed at all.
--   5. Repo + origin/main (820dba0, version 1.0.68 — the same build the OTA and the Vercel web
--      deploy come from): providerService calls provider_leads, and no `.from("users")` select
--      anywhere requests phone. Every users select was read individually, not grepped in bulk.
--   6. authService.ensureProfile still WRITES users.phone via upsert with no `.select()`, so it
--      takes no RETURNING and a SELECT-only revoke does not affect it.
--   7. The three functions that legitimately return a phone number — get_own_profile,
--      get_public_profile and provider_leads — are all SECURITY DEFINER on production, so they
--      keep working and keep applying show_phone_publicly server-side.
--
--   Not directly verified: the stryt.in HTML/JS could not be fetched (Vercel's bot checkpoint
--   answers curl). It is built from origin/main at the same 1.0.68 commit as the verified OTA
--   bundle, which is why this is recorded as corroborated rather than independently confirmed.
--   Worth 30 seconds in a browser's devtools before applying, if you want it airtight.
--
-- WHY
--   20260968 locked every sensitive users column except phone, which the shipped leads
--   inbox still reads. Until this runs, any signed-in user can read every visible user's
--   phone number through the API. Owners read their own phone via get_own_profile();
--   public profiles and provider leads apply show_phone_publicly server-side
--   (get_public_profile, provider_leads).
--
-- To apply: move this file into supabase/migrations/ with the next free number, move
-- users_phone_column_lockdown.rollback.sql into supabase/rollbacks/ under the same name,
-- re-run `git grep -n "phone" -- src` for any new users.phone reader, and follow the
-- procedure in docs/database/HANDOFF.md §5.

revoke select (phone) on public.users from authenticated;

notify pgrst, 'reload schema';
