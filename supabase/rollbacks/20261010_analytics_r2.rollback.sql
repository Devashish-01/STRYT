-- Rollback for 20261010_analytics_r2: back to the 20261009 (Release 1) definitions.
-- The function bodies, user_traits and seller_snapshot below are copied verbatim from 20261009_analytics_v1.sql.
-- Events already written by the Release 2 triggers are kept; delete them by name if they must go.

begin;

drop trigger if exists trg_analytics_businesses      on public.businesses;
drop trigger if exists trg_analytics_providers       on public.providers;
drop trigger if exists trg_analytics_access_sessions on public.business_access_sessions;
drop trigger if exists trg_analytics_conversations   on public.conversations;
drop trigger if exists trg_analytics_community_posts on public.community_posts;

drop function if exists public.analytics_businesses_aiu();
drop function if exists public.analytics_providers_aiu();
drop function if exists public.analytics_access_sessions_aiu();
drop function if exists public.analytics_conversations_ai();
drop function if exists public.analytics_community_posts_ai();

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

-- user_traits loses is_team_member, which create or replace view cannot drop.
drop view if exists analytics.user_traits;
create view analytics.user_traits as
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

drop materialized view if exists analytics.seller_snapshot;
create materialized view analytics.seller_snapshot as
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


notify pgrst, 'reload schema';

commit;
