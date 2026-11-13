-- 20261010_analytics_r2
--
-- Product analytics, Release 2 — the remaining database events of .telemetry/tracking-plan.yaml (1.2.0):
--
--   * agreement_cancelled  agreements → CANCELLED (reason: confirmation_timeout / user_cancelled / admin)
--   * booking_cancelled    appointments → REJECTED / CANCELLED / NO_SHOW, queue tokens → LEFT / EXPIRED
--   * seller_created       insert on businesses / providers
--   * seller_verified      verification_status → APPROVED (the column's real value; the plan said VERIFIED)
--   * team_member_added    a person's first ACTIVE access grant to a business. business_team_members has no UI and no
--                          rows; team access is business_access_sessions, which is a delegated login and is granted
--                          again on later days, so only the first grant per person and business counts as "added"
--   * conversation_started insert on conversations
--   * community_post_created insert on community_posts
--
-- The whitelist already holds every name (20261009). The client half of Release 2 (search_performed, seller_viewed,
-- seller_contacted, notification_opened) is app code only.
--
-- Also:
--   * events_drop_internal keeps two database events when an admin causes them — seller_verified and an admin
--     cancelling an agreement are facts about the marketplace, not internal activity. The row is kept with no
--     user_id and actor_role = 'system', so the admin is still never recorded.
--   * seller_snapshot.team_member_count and user_traits.is_team_member read business_access_sessions (the plan's
--     deferred trait — grantee_user_id makes it a join on an opaque id).
--
-- Props remain IDs, enums, booleans and counts, built column by column — never to_jsonb(new). Conversation subject
-- names, post titles and bodies, and phone numbers never leave their tables.
--
-- Rollback: supabase/rollbacks/20261010_analytics_r2.rollback.sql

begin;

-- ── 1. Internal-user exclusion: keep marketplace facts an admin causes, without the admin ────────────────────────────
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
    if new.source = 'db' and new.name in ('seller_verified', 'agreement_cancelled') then
      new.user_id := null;
      new.actor_role := 'system';
      return new;
    end if;
    return null;
  end if;
  return new;
end
$function$;
revoke all on function public.events_drop_internal() from public, anon, authenticated;

-- ── 2. agreements: + agreement_cancelled ─────────────────────────────────────────────────────────────────────────────
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
  elsif new.status = 'CANCELLED' then
    perform public.emit_event('agreement_cancelled', jsonb_build_object(
      'agreement_id', new.id,
      'cancelled_from_status', old.status::text,
      -- No session means a sweep: the only one that cancels agreements is the confirmation timeout.
      'cancel_reason', case
        when auth.uid() is null then 'confirmation_timeout'
        when exists (select 1 from public.users u
                      where u.id = (select auth.uid())::text and u.roles && array['admin', 'super_admin']::text[]) then 'admin'
        else 'user_cancelled' end),
      v_type, v_id, public.analytics_actor_role(v_type, v_id));
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_agreements_aiu() from public, anon, authenticated;

-- ── 3. appointments: + booking_cancelled ─────────────────────────────────────────────────────────────────────────────
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
  elsif new.status is distinct from old.status and new.status in ('REJECTED', 'CANCELLED', 'NO_SHOW') then
    perform public.emit_event('booking_cancelled', jsonb_build_object(
      'booking_id', new.id,
      'booking_type', 'appointment',
      'outcome', lower(new.status),
      'cancelled_by', lower(new.cancelled_by),            -- customer / owner / system; null when not recorded
      'fulfillment_type', new.fulfillment_type),
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

-- ── 4. queue_tokens: + booking_cancelled (LEFT, EXPIRED) ─────────────────────────────────────────────────────────────
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

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'SERVED' then
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
  elsif new.status in ('LEFT', 'EXPIRED') then
    perform public.emit_event('booking_cancelled', jsonb_build_object(
      'booking_id', new.id::text,
      'booking_type', 'queue',
      'outcome', lower(new.status)),
      'business', new.business_id, v_role);
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_queue_tokens_aiu() from public, anon, authenticated;

-- ── 5. businesses / providers: seller_created, seller_verified ───────────────────────────────────────────────────────
create or replace function public.analytics_businesses_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    perform public.emit_event('seller_created', jsonb_build_object(
      'category_id', new.category_id,
      'is_first_seller_for_user',
        not exists (select 1 from public.businesses b where b.owner_user_id = new.owner_user_id and b.id <> new.id)
        and not exists (select 1 from public.providers p where p.user_id = new.owner_user_id)),
      'business', new.id, 'seller');
    return null;
  end if;

  if new.verification_status = 'APPROVED' and old.verification_status is distinct from 'APPROVED' then
    perform public.emit_event('seller_verified', jsonb_build_object(
      'days_since_created', floor(extract(epoch from (now() - new.created_at)) / 86400)::integer),
      'business', new.id, 'system');
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_businesses_aiu() from public, anon, authenticated;

drop trigger if exists trg_analytics_businesses on public.businesses;
create trigger trg_analytics_businesses after insert or update of verification_status on public.businesses
  for each row execute function public.analytics_businesses_aiu();

create or replace function public.analytics_providers_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    perform public.emit_event('seller_created', jsonb_build_object(
      'category_id', new.category_id,
      'is_first_seller_for_user',
        not exists (select 1 from public.providers p where p.user_id = new.user_id and p.id <> new.id)
        and not exists (select 1 from public.businesses b where b.owner_user_id = new.user_id)),
      'provider', new.id, 'seller');
    return null;
  end if;

  if new.verification_status = 'APPROVED' and old.verification_status is distinct from 'APPROVED' then
    perform public.emit_event('seller_verified', jsonb_build_object(
      'days_since_created', floor(extract(epoch from (now() - new.created_at)) / 86400)::integer),
      'provider', new.id, 'system');
  end if;
  return null;
end
$function$;
revoke all on function public.analytics_providers_aiu() from public, anon, authenticated;

drop trigger if exists trg_analytics_providers on public.providers;
create trigger trg_analytics_providers after insert or update of verification_status on public.providers
  for each row execute function public.analytics_providers_aiu();

-- ── 6. business_access_sessions: team_member_added (first grant per person and business) ─────────────────────────────
create or replace function public.analytics_access_sessions_aiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status <> 'ACTIVE' or (tg_op = 'UPDATE' and old.status = 'ACTIVE') then
    return null;
  end if;
  -- A returning team member signing in again is not an addition.
  if exists (
    select 1 from public.business_access_sessions s
    where s.business_id = new.business_id and s.grantee_user_id = new.grantee_user_id and s.id <> new.id
      and s.status in ('ACTIVE', 'EXPIRED', 'REVOKED')
  ) then
    return null;
  end if;

  perform public.emit_event('team_member_added', jsonb_build_object(
    'access_level', lower(new.access_level),
    'scope_count', coalesce(cardinality(new.scopes), 0),
    'team_member_count', (select count(distinct s.grantee_user_id) from public.business_access_sessions s
                           where s.business_id = new.business_id and s.status = 'ACTIVE')),
    'business', new.business_id, public.analytics_actor_role('business', new.business_id));
  return null;
end
$function$;
revoke all on function public.analytics_access_sessions_aiu() from public, anon, authenticated;

drop trigger if exists trg_analytics_access_sessions on public.business_access_sessions;
create trigger trg_analytics_access_sessions after insert or update of status on public.business_access_sessions
  for each row execute function public.analytics_access_sessions_aiu();

-- ── 7. conversations: conversation_started ───────────────────────────────────────────────────────────────────────────
create or replace function public.analytics_conversations_ai()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := case when new.subject_type in ('business', 'provider') then new.subject_type end;
  v_id   text := case when new.subject_type in ('business', 'provider') then new.subject_id end;
begin
  -- Never subject_name, subject_avatar or the message preview.
  perform public.emit_event('conversation_started', jsonb_build_object(
    'conversation_id', new.id,
    'subject_type', new.subject_type),
    v_type, v_id,
    case when v_type is null then 'customer' else public.analytics_actor_role(v_type, v_id) end);
  return null;
end
$function$;
revoke all on function public.analytics_conversations_ai() from public, anon, authenticated;

drop trigger if exists trg_analytics_conversations on public.conversations;
create trigger trg_analytics_conversations after insert on public.conversations
  for each row execute function public.analytics_conversations_ai();

-- ── 8. community_posts: community_post_created ───────────────────────────────────────────────────────────────────────
create or replace function public.analytics_community_posts_ai()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text := case when new.author_type in ('business', 'provider') then new.author_type end;
  v_id   text := case when new.author_type in ('business', 'provider') then new.author_ref_id end;
begin
  -- Never the title, body, media, area or coordinates.
  perform public.emit_event('community_post_created', jsonb_build_object(
    'post_id', new.id,
    'post_type', new.type,
    'author_type', coalesce(new.author_type, 'user'),
    'has_media', coalesce(cardinality(new.media), 0) > 0 or new.image is not null),
    v_type, v_id,
    case when v_type is null then 'customer' else public.analytics_actor_role(v_type, v_id) end);
  return null;
end
$function$;
revoke all on function public.analytics_community_posts_ai() from public, anon, authenticated;

drop trigger if exists trg_analytics_community_posts on public.community_posts;
create trigger trg_analytics_community_posts after insert on public.community_posts
  for each row execute function public.analytics_community_posts_ai();

-- ── 9. Traits: team membership from business_access_sessions ─────────────────────────────────────────────────────────
-- create or replace view may only add columns at the end.
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
  (select max(e.created_at) from public.events e where e.user_id = u.id)  as last_active_at,
  exists (select 1 from public.business_access_sessions s
           where s.grantee_user_id = u.id and s.status = 'ACTIVE')        as is_team_member
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
    (select count(distinct a.grantee_user_id) from public.business_access_sessions a
      where a.business_id = s.seller_id and a.status = 'ACTIVE') end                            as team_member_count,
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

-- The daily refresh-seller-snapshot job refreshes concurrently, which needs this index.
create unique index seller_snapshot_pk on analytics.seller_snapshot (seller_type, seller_id);
revoke all on analytics.seller_snapshot from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Verify:
--   select tgname, tgrelid::regclass from pg_trigger where tgname like 'trg_analytics_%' order by 1;   -- 11 rows
--   -- cancel a test booking, leave a test queue, start a chat with a shop → one row each, source = 'db':
--   select created_at, name, actor_role, seller_type, seller_id, props from public.events
--    where source = 'db' order by created_at desc limit 20;
--   select seller_id, team_member_count from analytics.seller_snapshot where seller_type = 'business' limit 5;
-- Ledger (if applied in the SQL editor rather than apply_migration):
--   insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
--   values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), '20261010_analytics_r2',
--           array['-- applied in the SQL editor; source: supabase/migrations/20261010_analytics_r2.sql'], 'owner');
