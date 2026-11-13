-- Release 3 of the tracking plan — DRAFT, deliberately outside supabase/migrations/ so nothing applies it early.
--
-- When: about two weeks after Release 2 has shipped, and only once this returns 0 (no build still sends the old
-- per-step delivery names):
--   select count(*) from public.events
--    where name in ('delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started',
--                   'delivery_arrived', 'delivery_delivered', 'delivery_failed')
--      and created_at > now() - interval '7 days';
--
-- Then copy this file to supabase/migrations/<next number>_analytics_r3.sql, apply it with apply_migration, and record
-- it in supabase/APPLY_LOG.md. Rollback: re-add the seven names to events_name_known (the 20261009 constraint).

begin;

-- 1. Rows that arrived after 20261009 under the old names: same rewrite as 20261009 step 8.
update public.events set
  props = case name
    when 'delivery_packed'    then jsonb_build_object('status', 'packed')
    when 'delivery_assigned'  then jsonb_strip_nulls(jsonb_build_object('status', 'assigned', 'assignment_type', props->>'kind'))
    when 'delivery_picked_up' then jsonb_build_object('status', 'picked_up')
    when 'delivery_started'   then jsonb_build_object('status', 'on_the_way', 'is_legacy_ambiguous', true)
    when 'delivery_arrived'   then jsonb_build_object('status', 'arrived')
    when 'delivery_delivered' then jsonb_build_object('status', 'delivered')
    when 'delivery_failed'    then jsonb_strip_nulls(jsonb_build_object('status', 'failed', 'failure_reason', props->>'reason'))
  end,
  name = 'delivery_status_changed'
where name in ('delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started',
               'delivery_arrived', 'delivery_delivered', 'delivery_failed');

-- 2. Client rows of events that moved to the database, sent by builds older than Release 1. The db row for the same
--    change exists only if it happened after 20261009, so these are kept and told apart by source = 'client'.
--    Nothing to delete; dashboards filter moved events to source = 'db'.

-- 3. The whitelist: exactly the 28 plan events.
alter table public.events drop constraint if exists events_name_known;
alter table public.events add constraint events_name_known check (name in (
  -- client
  'otp_sent', 'otp_verified', 'otp_failed', 'signup_completed', 'request_viewed', 'search_performed',
  'seller_viewed', 'seller_contacted', 'notification_opened', 'share_link_opened', 'delivery_declined',
  -- db
  'seller_created', 'seller_verified', 'request_created', 'proposal_created', 'proposal_accepted',
  'agreement_cancelled', 'booking_created', 'booking_cancelled', 'deal_completed', 'dispute_opened',
  'review_left', 'delivery_status_changed', 'delivery_cash_collected', 'delivery_cash_settled',
  'team_member_added', 'conversation_started', 'community_post_created'
));

commit;
