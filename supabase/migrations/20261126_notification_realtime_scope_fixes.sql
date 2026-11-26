-- ============================================================
-- 20261126 — Fix notification scoping across Personal, Business, Provider,
-- and Delivery so no notification is hidden or skipped by scope filters.
--
-- Bugs fixed:
--   1. assign_delivery & assign_delivery_batch stamped delivery rider
--      notifications with entity_type = 'PROVIDER', entity_id = agent_user_id
--      instead of ('DELIVERY', agent_user_id).
--   2. bulk_deal_pledge_join stamped entity_type = 'bulk_deal', which matched
--      no app scope (CUSTOMER / BUSINESS / PROVIDER / DELIVERY).
--   3. broadcast_offer_to_nearby & broadcast_new_listing stamped customer-
--      addressed notifications with ('BUSINESS'|'PROVIDER'|'PLACE', target_id),
--      hiding them from every recipient customer's Personal inbox and badge.
--   4. Backfill existing mis-scoped rows so live inboxes update immediately.
-- ============================================================

-- ── 1. assign_delivery: stamp rider notifications as DELIVERY ───────────────
create or replace function public.assign_delivery(p_appointment_id text, p_agent_user_id text)
returns appointment_deliveries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_biz text;
  v_row public.appointment_deliveries%rowtype;
  v_code text;
  v_apt record;
  v_biz_name text;
  v_biz_address text;
  v_old_batch text;
  v_old_agent text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.id, a.target_id, a.customer_name, a.delivery_address_line, a.package_name, a.package_price, a.customer_user_id,
         a.status, a.fulfillment_type
    into v_apt from public.appointments a
   where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_apt.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_biz := v_apt.target_id;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if v_apt.fulfillment_type is distinct from 'DELIVERY' then raise exception 'NOT_A_DELIVERY_ORDER'; end if;
  if v_apt.status is distinct from 'ACCEPTED' then raise exception 'ORDER_NOT_ACCEPTED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;

  select b.name, b.address_line1 into v_biz_name, v_biz_address from public.businesses b where b.id = v_biz;

  select * into v_row from public.appointment_deliveries
    where appointment_id = p_appointment_id and status in ('ASSIGNED','EN_ROUTE','ARRIVED') for update;
  if found then
    if v_row.agent_user_id is not distinct from p_agent_user_id then
      v_row.handoff_code := null;
      return v_row;
    end if;

    v_old_batch := v_row.batch_id;
    v_old_agent := v_row.agent_user_id;
    v_code := public.new_handoff_code();
    delete from public.handoff_attempts where delivery_id = v_row.id;
    update public.appointment_deliveries
       set agent_user_id = p_agent_user_id,
           status = 'ASSIGNED',
           handoff_verified = false,
           handoff_code = v_code,
           batch_id = null,
           stop_order = null,
           live_status = null,
           picked_up_at = null,
           started_at = null,
           arrived_at = null,
           lat = null, lng = null, heading = null, position_at = null,
           proof_photo_url = null, proof_note = null, proof_at = null
     where id = v_row.id returning * into v_row;

    if v_old_batch is not null and not exists (
      select 1 from public.appointment_deliveries d
       where d.batch_id = v_old_batch and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
    ) then
      update public.delivery_batches set status = 'COMPLETED', completed_at = now()
       where id = v_old_batch and status in ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS');
    end if;

    if v_old_agent is not null then
      begin
        insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
        values (
          v_old_agent, 'DELIVERY', 'Delivery reassigned — don''t deliver',
          coalesce(v_biz_name, 'The shop') || ' gave this delivery to someone else. You don''t need to deliver it.',
          '/delivery',
          jsonb_build_object('appointmentId', p_appointment_id, 'statusPill', 'Reassigned', 'tone', 'warning'),
          'DELIVERY', v_old_agent
        );
      exception when others then null; end;
    end if;
  else
    v_code := public.new_handoff_code();
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code)
    values (p_appointment_id, v_biz, p_agent_user_id, 'ASSIGNED', v_code) returning * into v_row;

    begin
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        v_apt.customer_user_id, 'DELIVERY', 'Delivery partner assigned',
        coalesce(v_biz_name, 'The shop') || ' has arranged a delivery partner for your order.',
        '/appointments',
        jsonb_build_object('appointmentId', p_appointment_id, 'statusPill', 'Assigned', 'tone', 'brand'),
        'CUSTOMER', v_apt.customer_user_id
      );
    exception when others then null; end;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      p_agent_user_id,
      'DELIVERY',
      'New delivery assigned',
      coalesce(v_biz_name, 'The business') || ' assigned you a delivery for ' || coalesce(v_apt.customer_name, 'a customer') || '.',
      '/delivery',
      jsonb_build_object(
        'deliveryId', v_row.id,
        'appointmentId', p_appointment_id,
        'pickupAddress', coalesce(v_biz_address, v_biz_name),
        'dropoffAddress', v_apt.delivery_address_line,
        'customerName', v_apt.customer_name,
        'amount', v_apt.package_price,
        'serviceName', v_apt.package_name,
        'statusPill', 'Assigned',
        'tone', 'brand',
        'actions', jsonb_build_array('ACCEPT_DELIVERY', 'DECLINE_DELIVERY')
      ),
      'DELIVERY',
      p_agent_user_id
    );
  exception when others then null; end;

  v_row.handoff_code := null;
  return v_row;
end $function$;

revoke all on function public.assign_delivery(text, text) from public, anon;
grant execute on function public.assign_delivery(text, text) to authenticated;

-- ── 2. assign_delivery_batch: stamp rider run notification as DELIVERY ──────
create or replace function public.assign_delivery_batch(p_appointment_ids text[], p_agent_user_id text)
returns delivery_batches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_biz text;
  v_count int;
  v_batch public.delivery_batches%rowtype;
  v_apt_id text;
  v_biz_name text;
  v_biz_address text;
  v_customer text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_appointment_ids is null or array_length(p_appointment_ids, 1) is null then
    raise exception 'NO_APPOINTMENTS_SELECTED';
  end if;

  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_ids[1] and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;

  select count(*) into v_count
    from public.appointments a
    where a.id = any(p_appointment_ids)
      and a.target_type = 'BUSINESS' and a.target_id = v_biz
      and a.fulfillment_type = 'DELIVERY' and a.status = 'ACCEPTED'
      and not exists (
        select 1 from public.appointment_deliveries d
        where d.appointment_id = a.id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
      );
  if v_count <> array_length(p_appointment_ids, 1) then
    raise exception 'SOME_APPOINTMENTS_NOT_ELIGIBLE';
  end if;

  select b.name, b.address_line1 into v_biz_name, v_biz_address from public.businesses b where b.id = v_biz;

  insert into public.delivery_batches (business_id, agent_user_id)
    values (v_biz, p_agent_user_id) returning * into v_batch;

  foreach v_apt_id in array p_appointment_ids loop
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code, batch_id)
    values (v_apt_id, v_biz, p_agent_user_id, 'ASSIGNED', public.new_handoff_code(), v_batch.id);

    begin
      select a.customer_user_id into v_customer from public.appointments a where a.id = v_apt_id;
      insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
      values (
        v_customer, 'DELIVERY', 'Delivery partner assigned',
        coalesce(v_biz_name, 'The shop') || ' has arranged a delivery partner for your order.',
        '/appointments',
        jsonb_build_object('appointmentId', v_apt_id, 'statusPill', 'Assigned', 'tone', 'brand'),
        'CUSTOMER', v_customer
      );
    exception when others then null; end;
  end loop;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata, entity_type, entity_id)
    values (
      p_agent_user_id,
      'DELIVERY',
      'New delivery run',
      'You have ' || array_length(p_appointment_ids, 1) || ' deliveries to accept from ' || coalesce(v_biz_name, 'the store') || '.',
      '/delivery',
      jsonb_build_object(
        'batchId', v_batch.id,
        'stopCount', array_length(p_appointment_ids, 1),
        'pickupAddress', coalesce(v_biz_address, v_biz_name),
        'statusPill', 'Run Assigned',
        'tone', 'brand',
        'actions', jsonb_build_array('ACCEPT_DELIVERY', 'DECLINE_DELIVERY')
      ),
      'DELIVERY',
      p_agent_user_id
    );
  exception when others then null; end;

  return v_batch;
end $function$;

revoke all on function public.assign_delivery_batch(text[], text) from public, anon;
grant execute on function public.assign_delivery_batch(text[], text) to authenticated;

-- ── 3. bulk_deal_pledge_join: stamp BUSINESS owner scope instead of bulk_deal ─
CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_join(
  p_deal_id text, p_quantity integer default 1, p_notes text default null,
  p_delivery_address text default null
) RETURNS public.bulk_deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_mine integer;
  v_others integer;
  v_total_pledged integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.status <> 'ACTIVE' then raise exception 'DEAL_NOT_ACTIVE'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;
  if v_deal.owner_user_id = v_uid then raise exception 'OWNER_CANNOT_PLEDGE'; end if;

  if v_deal.fulfillment_type = 'DOORSTEP'
     and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  if exists (
    select 1 from public.bulk_deal_pledges
    where deal_id = p_deal_id and user_id = v_uid and deposit_status in ('PAID', 'PENDING_CONFIRM')
      and quantity <> p_quantity
  ) then
    raise exception 'CANNOT_MODIFY_PAID_PLEDGE';
  end if;

  if v_deal.available_quota is not null then
    select quantity into v_mine
      from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid;
    v_others := greatest(coalesce(v_deal.pledged_quantity, 0) - coalesce(v_mine, 0), 0);
    if v_others + p_quantity > v_deal.available_quota then
      raise exception 'INSUFFICIENT_QUOTA';
    end if;
  end if;

  insert into public.bulk_deal_pledges (deal_id, user_id, quantity, notes, delivery_address)
  values (p_deal_id, v_uid, p_quantity,
          nullif(left(trim(coalesce(p_notes,'')), 300), ''),
          nullif(left(trim(coalesce(p_delivery_address,'')), 400), ''))
  on conflict (deal_id, user_id) do update
    set quantity = excluded.quantity,
        notes = excluded.notes,
        delivery_address = excluded.delivery_address;

  select coalesce(sum(quantity), 0) into v_total_pledged from public.bulk_deal_pledges where deal_id = p_deal_id;

  update public.bulk_deals
     set pledged_quantity = v_total_pledged
   where id = p_deal_id
  returning * into v_deal;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, entity_type, entity_id, metadata)
    values (
      v_deal.owner_user_id,
      'BULK_DEAL_PLEDGE',
      'New deal pledge',
      'Someone joined your bulk deal for ' || v_deal.title || '.',
      '/deals/' || p_deal_id,
      case when v_deal.business_id is not null then 'BUSINESS' else 'CUSTOMER' end,
      coalesce(v_deal.business_id, v_deal.owner_user_id),
      jsonb_build_object('deal_id', p_deal_id, 'businessId', v_deal.business_id, 'quantity', p_quantity)
    );
  exception when others then
    null;
  end;

  return v_deal;
end $function$;

REVOKE ALL ON FUNCTION public.bulk_deal_pledge_join(text, integer, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_join(text, integer, text, text) TO authenticated;

-- ── 4. broadcast_offer_to_nearby & broadcast_new_listing: stamp CUSTOMER ────
create or replace function public.broadcast_offer_to_nearby(
  p_offer_id text,
  p_radius_km double precision default 5.0
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r_offer record;
  r_biz record;
  r_user record;
  v_count int := 0;
  v_meta jsonb;
begin
  select * into r_offer
    from public.offers
   where id = p_offer_id;
  if not found then
    return 0;
  end if;

  select * into r_biz
    from public.businesses
   where id = r_offer.business_id;
  if not found then
    return 0;
  end if;

  if r_biz.owner_user_id is distinct from auth.uid()::text and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  v_meta := jsonb_build_object(
    'offerId', r_offer.id,
    'businessId', r_biz.id,
    'businessName', r_biz.name,
    'offerTitle', r_offer.title,
    'offerCode', r_offer.code,
    'discountText', coalesce(r_biz.offer_text, r_offer.title),
    'validUntil', r_offer.valid_until,
    'imageUrl', r_biz.cover_image,
    'category', r_biz.category_name,
    'address', r_biz.address_line1,
    'statusPill', 'Special Offer',
    'tone', 'accent',
    'actions', jsonb_build_array('CLAIM_OFFER', 'VIEW_STORE')
  );

  for r_user in
    select u.id
      from public.users u
     where u.id <> coalesce(r_biz.owner_user_id, '')
       and coalesce(u.notif_offers, true) = true
       and u.lat is not null and u.lng is not null
       and r_biz.lat is not null and r_biz.lng is not null
       and u.lat between r_biz.lat - (least(p_radius_km, 50.0) / 111.0) and r_biz.lat + (least(p_radius_km, 50.0) / 111.0)
       and u.lng between r_biz.lng - (least(p_radius_km, 50.0) / 111.0) and r_biz.lng + (least(p_radius_km, 50.0) / 111.0)
     limit 250
  loop
    insert into public.notifications (
      user_id, type, title, body, deep_link, metadata, entity_type, entity_id
    ) values (
      r_user.id,
      'OFFER',
      'Exclusive Offer from ' || r_biz.name,
      r_offer.title,
      '/business/' || r_biz.id,
      v_meta,
      'CUSTOMER',
      r_user.id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.broadcast_offer_to_nearby(text, double precision) from public, anon;
grant execute on function public.broadcast_offer_to_nearby(text, double precision) to authenticated;

create or replace function public.broadcast_new_listing(
  p_type text,
  p_id text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r_user record;
  v_count int := 0;
  v_lat double precision;
  v_lng double precision;
  v_radius_km double precision := 5.0;
  v_owner_id text;
  v_name text;
  v_cat text;
  v_img text;
  v_addr text;
  v_phone text;
  v_notif_type text;
  v_title text;
  v_body text;
  v_link text;
  v_meta jsonb;
begin
  if p_type = 'business' then
    select owner_user_id, lat, lng, broadcast_radius, name, category_name, cover_image, address_line1, phone
      into v_owner_id, v_lat, v_lng, v_radius_km, v_name, v_cat, v_img, v_addr, v_phone
      from public.businesses
     where id = p_id;
    if not found then return 0; end if;

    v_radius_km := coalesce(v_radius_km, 5.0);
    v_cat := coalesce(v_cat, 'Shop');
    v_name := coalesce(v_name, 'A new business');
    v_notif_type := 'NEW_BUSINESS';
    v_title := 'New ' || v_cat || ' near you';
    v_body := v_name || ' is now open in your area';
    v_link := '/business/' || p_id;

    v_meta := jsonb_build_object(
      'businessId', p_id, 'businessName', v_name, 'category', v_cat, 'imageUrl', v_img,
      'address', v_addr, 'phone', v_phone, 'lat', v_lat, 'lng', v_lng,
      'statusPill', 'Newly Opened', 'tone', 'primary',
      'actions', jsonb_build_array('VIEW_BUSINESS', 'DIRECTIONS')
    );

  elsif p_type = 'provider' then
    select user_id, lat, lng, service_radius_km, display_name, category_name, avatar, phone
      into v_owner_id, v_lat, v_lng, v_radius_km, v_name, v_cat, v_img, v_phone
      from public.providers
     where id = p_id;
    if not found then return 0; end if;

    v_radius_km := coalesce(v_radius_km, 5.0);
    v_cat := coalesce(v_cat, 'Provider');
    v_name := coalesce(v_name, 'A new provider');
    v_notif_type := 'NEW_PROVIDER';
    v_title := 'New ' || v_cat || ' near you';
    v_body := v_name || ' is now available for bookings';
    v_link := '/provider/' || p_id;

    v_meta := jsonb_build_object(
      'providerId', p_id, 'providerName', v_name, 'category', v_cat, 'imageUrl', v_img,
      'phone', v_phone, 'lat', v_lat, 'lng', v_lng,
      'statusPill', 'New Provider', 'tone', 'positive',
      'actions', jsonb_build_array('VIEW_PROVIDER', 'BOOK_APPOINTMENT')
    );

  elsif p_type = 'place' then
    select submitted_by_user_id, lat, lng, name, category, cover_image, address_line1
      into v_owner_id, v_lat, v_lng, v_name, v_cat, v_img, v_addr
      from public.places
     where id = p_id;
    if not found then return 0; end if;

    v_radius_km := 10.0;
    v_cat := coalesce(v_cat, 'Place');
    v_name := coalesce(v_name, 'A new place');
    v_notif_type := 'NEW_PLACE';
    v_title := 'New ' || v_cat || ' near you';
    v_body := v_name || ' was just added to your neighborhood map';
    v_link := '/place/' || p_id;

    v_meta := jsonb_build_object(
      'placeId', p_id, 'placeName', v_name, 'category', v_cat, 'imageUrl', v_img,
      'address', v_addr, 'lat', v_lat, 'lng', v_lng,
      'statusPill', 'New Landmark', 'tone', 'brand',
      'actions', jsonb_build_array('VIEW_PLACE', 'DIRECTIONS')
    );
  else
    return 0;
  end if;

  if v_owner_id is distinct from auth.uid()::text and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  if v_lat is null or v_lng is null then
    return 0;
  end if;

  for r_user in
    select u.id
      from public.users u
     where u.id <> coalesce(v_owner_id, '')
       and coalesce(u.notif_new_business, true) = true
       and u.lat is not null and u.lng is not null
       and u.lat between v_lat - (least(v_radius_km, 50.0) / 111.0) and v_lat + (least(v_radius_km, 50.0) / 111.0)
       and u.lng between v_lng - (least(v_radius_km, 50.0) / 111.0) and v_lng + (least(v_radius_km, 50.0) / 111.0)
     limit 250
  loop
    insert into public.notifications (
      user_id, type, title, body, deep_link, metadata, entity_type, entity_id
    ) values (
      r_user.id,
      v_notif_type,
      v_title,
      v_body,
      v_link,
      v_meta,
      'CUSTOMER',
      r_user.id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.broadcast_new_listing(text, text) from public, anon;
grant execute on function public.broadcast_new_listing(text, text) to authenticated;

-- ── 5. Backfill mis-scoped existing notification rows ──────────────────────
update public.notifications
   set entity_type = 'DELIVERY'
 where entity_type = 'PROVIDER'
   and deep_link like '/delivery%';

update public.notifications n
   set entity_type = case when d.business_id is not null then 'BUSINESS' else 'CUSTOMER' end,
       entity_id   = coalesce(d.business_id, n.user_id)
  from public.bulk_deals d
 where n.entity_type = 'bulk_deal'
   and d.id = n.entity_id;

update public.notifications
   set entity_type = 'CUSTOMER',
       entity_id   = user_id
 where entity_type = 'bulk_deal';

update public.notifications
   set entity_type = 'CUSTOMER',
       entity_id   = user_id
 where type in ('OFFER', 'NEW_BUSINESS', 'NEW_PROVIDER', 'NEW_PLACE')
   and entity_type in ('BUSINESS', 'PROVIDER', 'PLACE');
