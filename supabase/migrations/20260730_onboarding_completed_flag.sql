-- ============================================================
-- Adds an explicit, account-level "has this user finished onboarding" flag.
--
-- Bug: the first-login onboarding screen (UserOnboard.tsx) was gated purely
-- by inferring intent from users.name ("empty / 'New user' / phone-shaped" =
-- needs onboarding). That heuristic only holds for phone-OTP signups, where
-- the profile self-heal (userService.me()) has nothing better than "New
-- user" to seed the name with. Google OAuth seeds a real name from
-- user_metadata.full_name immediately, and email OTP/password seeds the
-- local-part of the email address — both look like "a real name" to the
-- heuristic, so those users silently skipped onboarding on their very first
-- login. Google/email users never saw the location/phone/emergency-contact
-- step at all.
--
-- Also replaces the localStorage "onboarding_skipped" flag (device-local —
-- skipping on one device didn't stick on another) with this account-level
-- column so the decision is consistent everywhere the user signs in.
--
-- Run manually in Supabase SQL editor.
-- ============================================================

alter table public.users
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.users.onboarding_completed_at is
  'Set when the user finishes or explicitly skips the first-login onboarding screen (UserOnboard.tsx). NULL means onboarding is still owed. Backfilled to created_at for pre-existing rows so current users are not re-prompted.';

-- Existing users have already been using the app — don't force them back
-- through onboarding retroactively. Only rows created after this migration
-- (and thus starting NULL) will be routed to /auth/onboard.
update public.users
   set onboarding_completed_at = created_at
 where onboarding_completed_at is null;
