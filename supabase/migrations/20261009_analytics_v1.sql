-- 20261009_analytics_v1
--
-- Product analytics v1, Release 1 — implements .telemetry/tracking-plan.yaml (see .telemetry/instrument.md).
--
-- Until now every product event was sent by the client (src/lib/analytics.ts). That misses whatever the client never
-- sees — a queue token served by the shop, an appointment completed from the business console, a delivery advanced
-- from the rider's offline outbox — and loses whatever an offline device or an ad blocker drops. So:
--
--   * public.emit_event() is the database writer. Triggers on the source tables call it, in the same transaction as
--     the write, for every state change. If the write rolls back, the event never existed; if the event fails, the
--     write still succeeds (errors are downgraded to a WARNING).
--   * events gains group context (seller_type, seller_id), actor_role, source and platform. RLS pins client rows to
--     source = 'client'; only emit_event can write 'db'.
--   * Internal-user exclusion lives in one place, a BEFORE INSERT trigger, so both writers obey it.
--   * deal_completed — the north star — now covers all three ways a deal finishes: request agreement COMPLETED,
--     appointment COMPLETED, queue token SERVED. The client only ever saw the first.
--   * The seven per-step delivery events become delivery_status_changed. The old names stay whitelisted for one
--     release so native builds that have not updated keep landing; their rows are rewritten below.
--
-- What the client still sends (sign-in attempts, views, taps, the guest funnel) is unchanged in principle: things the
-- database cannot know. Props anywhere are IDs, enums, booleans, counts and rupee amounts — never a name, phone,
-- address, coordinate or typed text. Triggers build props column by column for that reason; never to_jsonb(new).
--
-- Rollback: supabase/rollbacks/20261009_analytics_v1.rollback.sql

begin;

-- ── 1. Envelope columns ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists source      text not null default 'client',
  add column if not exists platform    text,
  add column if not exists seller_type text,
  add column if not exists seller_id   text,
  add column if not exists actor_role  text;

alter table public.events
  add constraint events_source_known   check (source in ('client', 'db')),
  add constraint events_platform_known check (platform is null or platform in ('web', 'android', 'ios', 'server')),
  add constraint events_seller_known   check (seller_type is null or seller_type in ('business', 'provider')),
  add constraint events_seller_pair    check ((seller_type is null) = (seller_id is null)),
  add constraint events_actor_known    check (actor_role is null or actor_role in ('customer', 'seller', 'staff', 'system'));

-- "What happened at this shop" — the per-seller read every dashboard will make.
create index if not exists events_seller_name_created_idx
  on public.events (seller_id, name, created_at desc) where seller_id is not null;

-- ── 2. Client inserts may only write client rows ────────────────────────────────────────────────────────────────────
drop policy if exists events_insert_guest on public.events;
create policy events_insert_guest on public.events
  for insert to anon
  with check (user_id is null and source = 'client' and actor_role is distinct from 'system');

drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events
  for insert to authenticated
  with check (user_id = (select auth.uid())::text and source = 'client' and actor_role is distinct from 'system');

-- ── 3. The whitelist: the 28 plan events + 7 legacy delivery names (Release 3 removes the legacy ones) ──────────────
alter table public.events drop constraint if exists events_name_known;
alter table public.events add constraint events_name_known check (name in (
  -- client
  'otp_sent', 'otp_verified', 'otp_failed', 'signup_completed', 'request_viewed', 'search_performed',
  'seller_viewed', 'seller_contacted', 'notification_opened', 'share_link_opened', 'delivery_declined',
  -- db
  'seller_created', 'seller_verified', 'request_created', 'proposal_created', 'proposal_accepted',
  'agreement_cancelled', 'booking_created', 'booking_cancelled', 'deal_completed', 'dispute_opened',
  'review_left', 'delivery_status_changed', 'delivery_cash_collected', 'delivery_cash_settled',
  'team_member_added', 'conversation_started', 'community_post_created',
  -- legacy, still sent by native builds older than this release
  'delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started', 'delivery_arrived',
  'delivery_delivered', 'delivery_failed'
));

-- ── 4. Internal-user exclusion (internal_user_policy: by_role) ──────────────────────────────────────────────────────
-- One guard for both writers. Returning NULL skips the row without an error, so the app and the triggers never notice.
create or replace function public.events_drop_internal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.user_id is not null and exists (
    select 1 from public.users u
    where u.id = new.user_id and u.roles && array['admin', 'super_admin']::text[]
  ) then
    return null;
  end if;
  return new;
end
$function$;
revoke all on function public.events_drop_internal() from public, anon, authenticated;

drop trigger if exists trg_events_drop_internal on public.events;
create trigger trg_events_drop_internal before insert on public.events
  for each row execute function public.events_drop_internal();

-- ── 5. Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Who caused the event, relative to the seller it concerns. auth.uid() is the caller's JWT even under SECURITY
-- DEFINER; sweeps and cron jobs have none, which is exactly what 'system' means.
create or replace function public.analytics_actor_role(p_seller_type text, p_seller_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when auth.uid() is null then 'system'
    when p_seller_type = 'business' and exists (
      select 1 from public.businesses b where b.id = p_seller_id and b.owner_user_id = (select auth.uid())::text) then 'seller'
    when p_seller_type = 'provider' and exists (
      select 1 from public.providers p where p.id = p_seller_id and p.user_id = (select auth.uid())::text) then 'seller'
    when p_seller_type = 'business' and public.has_business_access(p_seller_id, (select auth.uid())::text) then 'staff'
    else 'customer'
  end
$function$;
revoke all on function public.analytics_actor_role(text, text) from public, anon, authenticated;

create or replace function public.analytics_minutes_since(p_from timestamptz)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select case when p_from is null then null
              else greatest(0, floor(extract(epoch from (now() - p_from)) / 60))::integer end
$function$;
revoke all on function public.analytics_minutes_since(timestamptz) from public, anon, authenticated;

-- ── 6. The database writer ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.emit_event(
  p_name        text,
  p_props       jsonb default '{}'::jsonb,
  p_seller_type text  default null,
  p_seller_id   text  default null,
  p_actor_role  text  default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := (select auth.uid())::text;
begin
  insert into public.events (name, props, user_id, source, platform, seller_type, seller_id, actor_role)
  values (
    p_name,
    jsonb_strip_nulls(coalesce(p_props, '{}'::jsonb)),
    v_uid,
    'db',
    'server',
    case when p_seller_id is not null then p_seller_type end,
    case when p_seller_type is not null then p_seller_id end,
    coalesce(p_actor_role, case when v_uid is null then 'system' else 'customer' end)
  );
exception when others then
  -- An analytics bug must never roll back the booking or deal that triggered it.
  raise warning 'emit_event(%) dropped: %', p_name, sqlerrm;
end
$function$;
revoke all on function public.emit_event(text, jsonb, text, text, text) from public, anon, authenticated;

-- ── 7. Triggers ─────────────────────────────────────────────────────────────────────────────────────────────────────

-- requests → request_created
create or replace function public.analytics_requests_ai()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.emit_event('request_created', jsonb_build_object(
    'request_id', new.id,
    'category_id', new.category_id,
    'is_bulk', new.bulk_price_per_unit is not null),
    null, null, 'customer');
  return null;
end
$function$;
revoke all on function public.analytics_requests_ai() from public, anon, authenticated;

drop trigger if exists trg_analytics_requests on public.requests;
create trigger trg_analytics_requests after insert on public.requests
  for each row execute function public.analytics_requests_ai();

-- proposals → proposal_created
create or replace function public.analytics_proposals_ai()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := case when new.responder_type in ('business', 'provider') then new.responder_type end;
  v_id   text := case when new.responder_type in ('business', 'provider') then new.responder_entity_id end;
begin
  perform public.emit_event('proposal_created', jsonb_build_object(
    'proposal_id', new.id,
    'request_id', new.request_id,
    'is_first_proposal', not exists (
      select 1 from public.proposals p where p.request_id = new.request_id and p.id <> new.id),
    -- Never the price or the message: one is a seller's commercially sensitive quote, the other is free text.
    'minutes_since_request', public.analytics_minutes_since(
      (select r.created_at from public.requests r where r.id = new.request_id))),
    v_type, v_id,
    -- An individual answering as themselves has no seller entity but is still the selling side.
    case when v_type is null then 'seller' else public.analytics_actor_role(v_type, v_id) end);
  return null;
end
$function$;
revoke all on function public.analytics_proposals_ai() from public, anon, authenticated;

drop trigger if exists trg_analytics_proposals on public.proposals;
create trigger trg_analytics_proposals after insert on public.proposals
  for each row execute function public.analytics_proposals_ai();

-- agreements → proposal_accepted (insert), deal_completed / dispute_opened (status)
create or replace function public.analytics_agreements_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := case when new.responder_type in ('business', 'provider') then new.responder_type end;
  v_id   text := case when new.responder_type in ('business', 'provider') then new.responder_entity_id end;
  v_req  record;
begin
  select r.category_id, r.fulfillment_type, r.created_at into v_req from public.requests r where r.id = new.request_id;

  if tg_op = 'INSERT' then
    -- accept_proposal and accept_proposal_counter both create the agreement, so this covers both paths.
    perform public.emit_event('proposal_accepted', jsonb_build_object(
      'proposal_id', new.proposal_id,
      'request_id', new.request_id,
      'agreement_id', new.id,
      -- accept_proposal_counter writes the counter amount as agreed_price; accept_proposal writes the proposal price.
      'is_via_counter', new.agreed_price is distinct from (select p.price from public.proposals p where p.id = new.proposal_id),
      'proposal_count', (select count(*) from public.proposals p where p.request_id = new.request_id)),
      v_type, v_id, 'customer');
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'COMPLETED' then
    perform public.emit_event('deal_completed', jsonb_build_object(
      'deal_type', 'request',
      'deal_id', new.id,
      'customer_id', new.requester_user_id,
      'category_id', v_req.category_id,
      'fulfillment_type', v_req.fulfillment_type,
      'deal_value', coalesce(new.payment_amount, new.agreed_price),
      'minutes_to_complete', public.analytics_minutes_since(v_req.created_at),
      'is_repeat_customer', exists (
        select 1 from public.agreements a
        where a.requester_user_id = new.requester_user_id
          and coalesce(a.responder_entity_id, a.responder_user_id) = coalesce(new.responder_entity_id, new.responder_user_id)
          and a.status = 'COMPLETED' and a.id <> new.id)),
      v_type, v_id, public.analytics_actor_role(v_type, v_id));
  elsif new.status = 'DISPUTED' then
    perform public.emit_event('dispute_opened', jsonb_build_object(
      'agreement_id', new.id,
      'disputed_from_status', old.status::text),
      v_type, v_id, public.analytics_actor_role(v_type, v_id));
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_agreements_aiu() from public, anon, authenticated;

drop trigger if exists trg_analytics_agreements on public.agreements;
create trigger trg_analytics_agreements after insert or update of status on public.agreements
  for each row execute function public.analytics_agreements_aiu();

-- appointments → booking_created (insert), deal_completed (status), delivery_status_changed 'packed' (ready_at),
--                delivery_cash_collected (cash_collected_at)
create or replace function public.analytics_appointments_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := lower(new.target_type);   -- BUSINESS / PROVIDER → business / provider
  v_role text := public.analytics_actor_role(lower(new.target_type), new.target_id);
  v_delivery_id text;
begin
  if tg_op = 'INSERT' then
    perform public.emit_event('booking_created', jsonb_build_object(
      'booking_id', new.id,
      'booking_type', 'appointment',
      'fulfillment_type', new.fulfillment_type),
      v_type, new.target_id, v_role);
    return null;
  end if;

  if new.status is distinct from old.status and new.status = 'COMPLETED' then
    perform public.emit_event('deal_completed', jsonb_build_object(
      'deal_type', 'appointment',
      'deal_id', new.id,
      'customer_id', new.customer_user_id,
      'category_id', case v_type
        when 'business' then (select b.category_id from public.businesses b where b.id = new.target_id)
        else (select p.category_id from public.providers p where p.id = new.target_id) end,
      'fulfillment_type', new.fulfillment_type,
      'deal_value', coalesce(new.payment_amount, new.package_price)::integer,
      'minutes_to_complete', public.analytics_minutes_since(new.created_at),
      'is_repeat_customer', exists (
        select 1 from public.appointments a
        where a.customer_user_id = new.customer_user_id and a.target_id = new.target_id
          and a.status = 'COMPLETED' and a.id <> new.id)),
      v_type, new.target_id, v_role);
  end if;

  -- Packed (mark_order_ready). Only delivery orders enter the delivery funnel; a pickup order being ready is not one.
  if new.ready_at is not null and old.ready_at is null and new.fulfillment_type = 'DELIVERY' then
    select d.id into v_delivery_id from public.appointment_deliveries d
     where d.appointment_id = new.id order by d.created_at desc limit 1;
    perform public.emit_event('delivery_status_changed', jsonb_build_object(
      'booking_id', new.id,
      'delivery_id', v_delivery_id,
      'status', 'packed'),
      v_type, new.target_id, v_role);
  end if;

  -- Cash taken at the door (delivery_collect_cash).
  if new.cash_collected_at is not null and old.cash_collected_at is null then
    select d.id into v_delivery_id from public.appointment_deliveries d
     where d.appointment_id = new.id order by d.created_at desc limit 1;
    perform public.emit_event('delivery_cash_collected', jsonb_build_object(
      'delivery_id', v_delivery_id),
      v_type, new.target_id, v_role);
  end if;

  return null;
end
$function$;
revoke all on function public.analytics_appointments_aiu() from public, anon, authenticated;

drop trigger if exists trg_analytics_appointments on public.appointments;
create trigger trg_analytics_appointments after insert or update of status, ready_at, cash_collected_at on public.appointments
  for each row execute function public.analytics_appointments_aiu();

-- queue_tokens → booking_created (insert), deal_completed (status → SERVED)
create or replace function public.analytics_queue_tokens_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.analytics_actor_role('business', new.business_id);
begin
  if tg_op = 'INSERT' then
    perform public.emit_event('booking_created', jsonb_build_object(
      'booking_id', new.id::text,
      'booking_type', 'queue'),
      'business', new.business_id, v_role);
    return null;
  end if;

  if new.status is distinct from old.status and new.status = 'SERVED' then
    perform public.emit_event('deal_completed', jsonb_build_object(
      'deal_type', 'queue',
      'deal_id', new.id::text,
      'customer_id', new.customer_user_id,          -- null for a walk-in guest
      'category_id', (select b.category_id from public.businesses b where b.id = new.business_id),
      'deal_value', new.payment_amount,
      'minutes_to_complete', public.analytics_minutes_since(new.created_at),
      'is_repeat_customer', new.customer_user_id is not null and exists (
        select 1 from public.queue_tokens q
        where q.customer_user_id = new.customer_user_id and q.business_id = new.business_id
          and q.status = 'SERVED' and q.id <> new.id)),
      'business', new.business_id, v_role);
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_queue_tokens_aiu() from public, anon, authenticated;

drop trigger if exists trg_analytics_queue_tokens on public.queue_tokens;
create trigger trg_analytics_queue_tokens after insert or update of status on public.queue_tokens
  for each row execute function public.analytics_queue_tokens_aiu();

-- ratings → review_left
create or replace function public.analytics_ratings_ai()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := case upper(new.ratee_type) when 'BUSINESS' then 'business' when 'PROVIDER' then 'provider' end;
begin
  perform public.emit_event('review_left', jsonb_build_object(
    'rating_id', new.id,
    'ratee_type', lower(new.ratee_type),
    'rating', new.rating,
    'has_comment', coalesce(btrim(new.comment), '') <> '',
    'has_tip', coalesce(new.tip, 0) > 0),
    v_type, case when v_type is not null then new.ratee_id end, 'customer');
  return null;
end
$function$;
revoke all on function public.analytics_ratings_ai() from public, anon, authenticated;

drop trigger if exists trg_analytics_ratings on public.ratings;
create trigger trg_analytics_ratings after insert on public.ratings
  for each row execute function public.analytics_ratings_ai();

-- appointment_deliveries → delivery_status_changed (assigned, picked_up, leaving, on_the_way, arrived, delivered, failed)
-- Position pings (update_delivery_position) touch lat/lng only and never fire this: the column list keeps them out.
create or replace function public.analytics_deliveries_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := public.analytics_actor_role('business', new.business_id);
  v_base   jsonb := jsonb_build_object('delivery_id', new.id, 'booking_id', new.appointment_id);
  v_status text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'ASSIGNED' then
      perform public.emit_event('delivery_status_changed', v_base || jsonb_build_object(
        'status', 'assigned',
        'assignment_type', case when new.batch_id is null then 'single' else 'run' end,
        'batch_id', new.batch_id),
        'business', new.business_id, v_role);
    end if;
    return null;
  end if;

  -- cancel_delivery: the delivery failed, with the rider's or owner's categorical reason (never the free-text note).
  if new.status = 'CANCELLED' and old.status is distinct from 'CANCELLED' then
    perform public.emit_event('delivery_status_changed', v_base || jsonb_build_object(
      'status', 'failed',
      'failure_reason', new.cancel_reason,
      'previous_status', lower(old.status)),
      'business', new.business_id, v_role);
    return null;
  end if;

  -- assign_delivery reusing the row: a fresh assignment or a reassignment to another rider.
  if new.status = 'ASSIGNED'
     and (old.status is distinct from 'ASSIGNED' or new.agent_user_id is distinct from old.agent_user_id) then
    perform public.emit_event('delivery_status_changed', v_base || jsonb_build_object(
      'status', 'assigned',
      'assignment_type', case when new.batch_id is null then 'single' else 'run' end,
      'batch_id', new.batch_id,
      'previous_status', lower(old.status)),
      'business', new.business_id, v_role);
  end if;

  if new.picked_up_at is not null and old.picked_up_at is null then
    perform public.emit_event('delivery_status_changed', v_base || jsonb_build_object('status', 'picked_up'),
      'business', new.business_id, v_role);
  end if;

  if new.live_status is distinct from old.live_status and new.live_status is not null then
    v_status := case new.live_status
      when 'LEAVING' then 'leaving'
      when 'ON_THE_WAY' then 'on_the_way'
      when 'ARRIVED' then 'arrived'
      when 'DONE' then 'delivered' end;
    if v_status is not null then
      perform public.emit_event('delivery_status_changed', v_base || jsonb_build_object(
        'status', v_status,
        'previous_status', lower(old.live_status)),
        'business', new.business_id, v_role);
    end if;
  end if;

  return null;
end
$function$;
revoke all on function public.analytics_deliveries_aiu() from public, anon, authenticated;

drop trigger if exists trg_analytics_deliveries on public.appointment_deliveries;
create trigger trg_analytics_deliveries
  after insert or update of status, live_status, picked_up_at, agent_user_id on public.appointment_deliveries
  for each row execute function public.analytics_deliveries_aiu();

-- settle_agent_cash → delivery_cash_settled. One settlement updates many appointments at once, so the event is emitted
-- here, once, rather than per row. Body is 20261002's, unchanged apart from counting the rows and the emit.
create or replace function public.settle_agent_cash(p_business_id text, p_agent_user_id text)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total numeric;
  v_count integer;
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
  select coalesce(sum(amt), 0), count(*) into v_total, v_count from settled;

  if v_count > 0 then
    perform public.emit_event('delivery_cash_settled', jsonb_build_object('delivery_count', v_count),
      'business', p_business_id, public.analytics_actor_role('business', p_business_id));
  end if;

  return v_total;
end $function$;

revoke all on function public.settle_agent_cash(text, text) from public, anon;
grant execute on function public.settle_agent_cash(text, text) to authenticated;

-- Indexes behind is_repeat_customer — one probe per completed deal.
create index if not exists agreements_repeat_idx   on public.agreements   (requester_user_id, responder_entity_id) where status = 'COMPLETED';
create index if not exists appointments_repeat_idx on public.appointments (customer_user_id, target_id)          where status = 'COMPLETED';
create index if not exists queue_tokens_repeat_idx on public.queue_tokens (customer_user_id, business_id)        where status = 'SERVED';

-- ── 8. Rewrite history to the v1 shape ──────────────────────────────────────────────────────────────────────────────
-- Low volume, and analysis is far simpler with one shape. Release 3 re-runs the delivery rewrite for rows that old
-- native builds sent in the meantime. Historical rows keep source = 'client' (column default) and platform = null:
-- the old wrapper never recorded it.
update public.events set
  props = case name
    when 'delivery_packed'    then jsonb_build_object('status', 'packed')
    when 'delivery_assigned'  then jsonb_strip_nulls(jsonb_build_object(
                                     'status', 'assigned', 'assignment_type', props->>'kind'))
    when 'delivery_picked_up' then jsonb_build_object('status', 'picked_up')
    when 'delivery_started'   then jsonb_build_object('status', 'on_the_way', 'is_legacy_ambiguous', true)  -- was LEAVING or ON_THE_WAY
    when 'delivery_arrived'   then jsonb_build_object('status', 'arrived')
    when 'delivery_delivered' then jsonb_build_object('status', 'delivered')
    when 'delivery_failed'    then jsonb_strip_nulls(jsonb_build_object('status', 'failed', 'failure_reason', props->>'reason'))
  end,
  name = 'delivery_status_changed'
where name in ('delivery_packed', 'delivery_assigned', 'delivery_picked_up', 'delivery_started',
               'delivery_arrived', 'delivery_delivered', 'delivery_failed');

update public.events set props =
  (props - 'native' - 'resend' - 'auto' - 'code' - 'provider' - 'guest' - 'kind' - 'valid' - 'interests' - 'skipped_location')
  || jsonb_strip_nulls(jsonb_build_object(
       'is_native',           props->'native',
       'is_resend',           props->'resend',
       'is_auto_verified',    props->'auto',
       'error_code',          props->'code',
       'provider_error_code', props->'provider',
       'is_guest',            props->'guest',
       'assignment_type',     case when name = 'delivery_declined' then props->'kind' end,
       'link_type',           case when name = 'share_link_opened' then props->'kind' end,
       'is_valid',            props->'valid',
       'interest_count',      props->'interests',
       'has_location',        case when props ? 'skipped_location'
                                   then to_jsonb(not (props->>'skipped_location')::boolean) end))
where name in ('otp_sent', 'otp_verified', 'otp_failed', 'request_viewed', 'delivery_declined',
               'share_link_opened', 'signup_completed');

-- ── 9. Trait views — admin / SQL console only, never exposed through PostgREST ──────────────────────────────────────
create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create or replace view analytics.user_traits as
select
  u.id         as user_id,
  u.created_at,
  u.area,
  u.society_id,
  u.language,
  exists (select 1 from public.businesses b where b.owner_user_id = u.id) as has_business,
  exists (select 1 from public.providers  p where p.user_id = u.id)       as has_provider,
  -- deal_completed.user_id is whoever marked it done (often staff), so the customer comes from props.customer_id.
  (select min(e.created_at) from public.events e
    where e.name = 'deal_completed' and e.props->>'customer_id' = u.id)   as first_deal_completed_at,
  (select count(*) from public.events e
    where e.name = 'deal_completed' and e.props->>'customer_id' = u.id)   as deals_completed_count,
  (select count(*) from public.requests r where r.requester_user_id = u.id) as requests_created_count,
  (select max(e.created_at) from public.events e where e.user_id = u.id)  as last_active_at
from public.users u;

create or replace view analytics.seller_traits as
select 'business'::text as seller_type, b.id as seller_id, b.category_id, b.status::text as status,
       coalesce(b.is_verified, false) as is_verified, b.city as area, b.created_at,
       null::text as pro_tier                      -- reserved: not monetizing yet
from public.businesses b
union all
select 'provider', p.id, p.category_id, p.status::text, coalesce(p.is_verified, false), null, p.created_at, null
from public.providers p;

create materialized view if not exists analytics.seller_snapshot as
select
  s.seller_type,
  s.seller_id,
  (select count(*) from public.catalog_items c
    where (s.seller_type = 'business' and c.business_id = s.seller_id)
       or (s.seller_type = 'provider' and c.provider_id = s.seller_id))                         as catalog_item_count,
  case when s.seller_type = 'business' then
    (select count(*) from public.business_team_members m where m.business_id = s.seller_id) end as team_member_count,
  case s.seller_type
    when 'business' then (select count(*) from public.business_view_logs v
                           where v.business_id = s.seller_id and v.viewed_at > now() - interval '30 days')
    else (select count(*) from public.provider_view_logs v
           where v.provider_id = s.seller_id and v.viewed_at > now() - interval '30 days') end      as views_30d,
  (select count(*) from public.events e where e.seller_id = s.seller_id and e.name = 'proposal_created'
     and e.created_at > now() - interval '30 days')                                            as proposals_sent_30d,
  (select count(*) from public.events e where e.seller_id = s.seller_id and e.name = 'deal_completed'
     and e.created_at > now() - interval '30 days')                                            as deals_completed_30d,
  (select percentile_cont(0.5) within group (order by (e.props->>'minutes_since_request')::numeric)
     from public.events e where e.seller_id = s.seller_id and e.name = 'proposal_created'
      and e.created_at > now() - interval '30 days')                                           as median_response_minutes_30d,
  now()                                                                                        as refreshed_at
from analytics.seller_traits s;

create unique index if not exists seller_snapshot_pk on analytics.seller_snapshot (seller_type, seller_id);

do $$
begin
  perform cron.schedule('refresh-seller-snapshot', '0 21 * * *',   -- 21:00 UTC = 02:30 IST
    'refresh materialized view concurrently analytics.seller_snapshot;');
exception when others then null;
end $$;

notify pgrst, 'reload schema';

commit;

-- Verify (staging first):
--   select created_at, name, source, actor_role, seller_type, seller_id, props from public.events order by created_at desc limit 20;
--   -- serve a test queue token from the business console → exactly one deal_completed, source = 'db', actor_role = 'seller' or 'staff'
--   select name, source, count(*) from public.events where created_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
--   select * from analytics.seller_snapshot limit 5;
