-- Rollback for 20261009_analytics_v1.
--
-- Not reversed: the history rewrite in step 8 (legacy delivery names and old prop keys are gone). Restore the events
-- table from a backup if the old shape is needed. Rows written with source = 'db' are dropped with the column data.

begin;

do $$ begin perform cron.unschedule('refresh-seller-snapshot'); exception when others then null; end $$;
drop materialized view if exists analytics.seller_snapshot;
drop view if exists analytics.seller_traits;
drop view if exists analytics.user_traits;
drop schema if exists analytics;

drop trigger if exists trg_analytics_requests     on public.requests;
drop trigger if exists trg_analytics_proposals    on public.proposals;
drop trigger if exists trg_analytics_agreements   on public.agreements;
drop trigger if exists trg_analytics_appointments on public.appointments;
drop trigger if exists trg_analytics_queue_tokens on public.queue_tokens;
drop trigger if exists trg_analytics_ratings      on public.ratings;
drop trigger if exists trg_analytics_deliveries   on public.appointment_deliveries;
drop trigger if exists trg_events_drop_internal   on public.events;

drop function if exists public.analytics_requests_ai();
drop function if exists public.analytics_proposals_ai();
drop function if exists public.analytics_agreements_aiu();
drop function if exists public.analytics_appointments_aiu();
drop function if exists public.analytics_queue_tokens_aiu();
drop function if exists public.analytics_ratings_ai();
drop function if exists public.analytics_deliveries_aiu();
drop function if exists public.events_drop_internal();

-- settle_agent_cash: back to the 20261002 body, without the emit.
create or replace function public.settle_agent_cash(p_business_id text, p_agent_user_id text)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total numeric;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, auth.uid()::text, 'appointments') then raise exception 'NOT_ALLOWED'; end if;

  with settled as (
    update public.appointments a
       set cash_settled_at = now()
      from public.appointment_deliveries d
     where d.appointment_id = a.id and d.status = 'DELIVERED' and d.agent_user_id = p_agent_user_id
       and a.target_type = 'BUSINESS' and a.target_id = p_business_id
       and a.cash_collected_at is not null and a.cash_settled_at is null
    returning coalesce(a.cash_collected_amount, a.payment_amount, 0) as amt
  )
  select coalesce(sum(amt), 0) into v_total from settled;

  return v_total;
end $function$;

revoke all on function public.settle_agent_cash(text, text) from public, anon;
grant execute on function public.settle_agent_cash(text, text) to authenticated;

drop function if exists public.emit_event(text, jsonb, text, text, text);
drop function if exists public.analytics_actor_role(text, text);
drop function if exists public.analytics_minutes_since(timestamptz);

drop index if exists public.agreements_repeat_idx;
drop index if exists public.appointments_repeat_idx;
drop index if exists public.queue_tokens_repeat_idx;
drop index if exists public.events_seller_name_created_idx;

-- The 20260996 insert policies.
drop policy if exists events_insert_guest on public.events;
create policy events_insert_guest on public.events
  for insert to anon
  with check (user_id is null);

drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events
  for insert to authenticated
  with check (user_id = (select auth.uid())::text);

-- The 20261003 whitelist. delivery_status_changed rows from step 8 would violate it, so they are removed first.
delete from public.events where name not in (
  'signup_completed', 'request_created', 'request_viewed', 'proposal_created', 'proposal_accepted',
  'booking_created', 'deal_completed', 'dispute_opened', 'review_left', 'share_link_opened',
  'otp_sent', 'otp_verified', 'otp_failed',
  'delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started', 'delivery_arrived',
  'delivery_delivered', 'delivery_failed', 'delivery_declined', 'delivery_cash_collected', 'delivery_cash_settled'
) or source = 'db';

alter table public.events drop constraint if exists events_name_known;
alter table public.events add constraint events_name_known check (name in (
  'signup_completed', 'request_created', 'request_viewed', 'proposal_created', 'proposal_accepted',
  'booking_created', 'deal_completed', 'dispute_opened', 'review_left', 'share_link_opened',
  'otp_sent', 'otp_verified', 'otp_failed',
  'delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started', 'delivery_arrived',
  'delivery_delivered', 'delivery_failed', 'delivery_declined', 'delivery_cash_collected', 'delivery_cash_settled'
));

alter table public.events
  drop constraint if exists events_source_known,
  drop constraint if exists events_platform_known,
  drop constraint if exists events_seller_known,
  drop constraint if exists events_seller_pair,
  drop constraint if exists events_actor_known,
  drop column if exists source,
  drop column if exists platform,
  drop column if exists seller_type,
  drop column if exists seller_id,
  drop column if exists actor_role;

notify pgrst, 'reload schema';

commit;
