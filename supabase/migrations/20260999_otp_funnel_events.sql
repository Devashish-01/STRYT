-- 20260999_otp_funnel_events
--
-- Phone sign-in is now a front door (Firebase SMS -> firebase-phone-auth -> Supabase session) and it costs money per
-- SMS on Firebase Blaze. Without numbers there is no way to tell "the code never arrives" from "people mistype it" from
-- "someone is farming SMS", and no way to see whether the funnel converts. Three events, added to the same whitelist
-- that is the collection notice (see 20260996): the whitelist IS the statement of what is collected.
--
--   otp_sent      props: { native: boolean, resend: boolean }     a code was requested and accepted by Firebase
--   otp_verified  props: { native: boolean, auto: boolean }       the sign-in completed (auto = Android auto-verify)
--   otp_failed    props: { step: 'send'|'verify'|'bridge'|'session', code: string }   code = an i18n error key, e.g. otp_err_invalid_code
--
-- Nothing personal: never the phone number, the code or an error message from a provider. These fire before a session
-- exists, so they arrive as `anon` rows with user_id null, which events_insert_guest already allows. Admins read them
-- through events_admin_read.
--
-- Useful queries (run as admin):
--   -- conversion + failure mix, last 7 days
--   select name, props->>'code' as code, count(*) from public.events
--   where name like 'otp_%' and created_at > now() - interval '7 days' group by 1, 2 order by 3 desc;
--
-- Rollback: supabase/rollbacks/20260999_otp_funnel_events.rollback.sql

begin;

alter table public.events drop constraint if exists events_name_known;

alter table public.events add constraint events_name_known check (name in (
  'signup_completed',
  'request_created',
  'request_viewed',
  'proposal_created',
  'proposal_accepted',
  'booking_created',
  'deal_completed',
  'dispute_opened',
  'review_left',
  'share_link_opened',
  'otp_sent',
  'otp_verified',
  'otp_failed'
));

notify pgrst, 'reload schema';

commit;
