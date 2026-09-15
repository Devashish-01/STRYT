-- users.phone lockdown — follow-up to 20260968. DRAFT: NOT APPLIED.
--
-- ⚠ DO NOT APPLY until the app build whose providerService.leads() calls provider_leads()
--   (migration 20260972) is live for users: OTA bundle and stryt.in. Check the published
--   bundle, not the repo: `app-updates/latest.json` → bundle zip must contain
--   "provider_leads" and must NOT contain `users!from_user_id(name, alias, avatar, phone`.
--   Older builds embed users.phone in the provider leads inbox; after this runs, that
--   query fails with 42501 and the inbox shows nothing for providers on old builds.
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
