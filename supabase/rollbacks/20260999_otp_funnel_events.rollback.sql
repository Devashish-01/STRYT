-- Rollback for 20260999_otp_funnel_events
--
-- Puts the events whitelist back to the ten names from 20260996. Existing otp_* rows would violate the restored
-- constraint, so they are deleted first (they are disposable funnel counters, not records).
-- Roll the client back too, or track("otp_*") will be rejected by the CHECK; track() swallows that silently by design.

begin;

delete from public.events where name in ('otp_sent', 'otp_verified', 'otp_failed');

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
  'share_link_opened'
));

notify pgrst, 'reload schema';

commit;
