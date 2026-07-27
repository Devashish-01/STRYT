-- Delivery Agent — Phase 4: batch assignment, all-or-nothing accept, home
-- delivery at booking, and the "out for delivery" notification that never
-- fired before. See app-plans/09_delivery_boy_flow.md and the phase-4 plan.
-- Additive/idempotent; still behind DELIVERY_AGENT_ENABLED client-side.
--   1) appointments: fulfillment_type + delivery address/coords at booking.
--   2) delivery_batches: the "accept whole run or nothing" unit; RLS.
--   3) appointment_deliveries: batch_id + stop_order.
--   4) RPCs: assign_delivery_batch, accept_delivery_batch, decline_delivery_batch,
--      update_delivery_batch_position.
--   5) appointment_update_delivery_status: batch-gated, auto-progresses the
--      batch, and — the actual gap this closes — inserts the customer
--      notification on EN_ROUTE ("out for delivery") and DELIVERED.
--   6) appointment_create: accepts fulfillment/delivery-address params.
--   7) get_tracking: adds stops_before, prefers the batch's live position.

-- 1) appointments: fulfillment + delivery address ----------------------------
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS fulfillment_type text
  NOT NULL DEFAULT 'IN_STORE' CHECK (fulfillment_type IN ('IN_STORE','DELIVERY'));
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS delivery_address_line text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS delivery_lat double precision;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS delivery_lng double precision;

-- 2) delivery_batches ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_batches (
  id text PRIMARY KEY DEFAULT ('batch_' || replace(gen_random_uuid()::text, '-', '')),
  business_id text NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING_ACCEPTANCE'
    CHECK (status IN ('PENDING_ACCEPTANCE','ACCEPTED','DECLINED','IN_PROGRESS','COMPLETED','CANCELLED')),
  lat double precision, lng double precision, accuracy double precision, heading double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS delivery_batches_agent_idx ON public.delivery_batches (agent_user_id);

ALTER TABLE public.delivery_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_batches_select ON public.delivery_batches;
CREATE POLICY delivery_batches_select ON public.delivery_batches
  FOR SELECT USING (
    agent_user_id = (auth.uid())::text
    OR public.has_business_scope(business_id, (auth.uid())::text, 'delivery')
  );
GRANT SELECT ON public.delivery_batches TO authenticated;

-- 3) appointment_deliveries: batch grouping + route position -----------------
ALTER TABLE public.appointment_deliveries ADD COLUMN IF NOT EXISTS batch_id text
  REFERENCES public.delivery_batches(id) ON DELETE SET NULL;
ALTER TABLE public.appointment_deliveries ADD COLUMN IF NOT EXISTS stop_order int;
CREATE INDEX IF NOT EXISTS appointment_deliveries_batch_idx ON public.appointment_deliveries (batch_id);

-- 4a) assign_delivery_batch ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_delivery_batch(p_appointment_ids text[], p_agent_user_id text)
 RETURNS public.delivery_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_biz text;
  v_count int;
  v_batch public.delivery_batches%rowtype;
  v_apt_id text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_appointment_ids is null or array_length(p_appointment_ids, 1) is null then
    raise exception 'NO_APPOINTMENTS_SELECTED';
  end if;

  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_ids[1] and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_scope(v_biz, p_agent_user_id, 'delivery') then raise exception 'AGENT_NOT_DELIVERY_MEMBER'; end if;

  -- Every id must belong to this business, be a DELIVERY-fulfillment booking,
  -- ACCEPTED, and not already have a live (non-terminal) delivery — the same
  -- eligibility assign_delivery enforces for a single appointment.
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

  insert into public.delivery_batches (business_id, agent_user_id)
    values (v_biz, p_agent_user_id) returning * into v_batch;

  foreach v_apt_id in array p_appointment_ids loop
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code, batch_id)
    values (v_apt_id, v_biz, p_agent_user_id, 'ASSIGNED',
            lpad((floor(random() * 1000000))::int::text, 6, '0'), v_batch.id);
  end loop;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (p_agent_user_id, 'QUEUE_UPDATE', 'New delivery run',
            'You have ' || array_length(p_appointment_ids, 1) || ' deliveries to accept.', '/delivery');
  exception when others then null; end;

  return v_batch;
end $function$;

-- 4b) accept_delivery_batch — all-or-nothing gate, persists the client's
--     computed stop order in the same transaction as acceptance. -------------
CREATE OR REPLACE FUNCTION public.accept_delivery_batch(p_batch_id text, p_stop_order text[] DEFAULT NULL)
 RETURNS public.delivery_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_batch public.delivery_batches%rowtype;
  v_id text;
  v_i int := 0;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_uid is distinct from v_batch.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_batch.status <> 'PENDING_ACCEPTANCE' then raise exception 'INVALID_BATCH_STATE'; end if;

  if p_stop_order is not null then
    foreach v_id in array p_stop_order loop
      v_i := v_i + 1;
      update public.appointment_deliveries set stop_order = v_i
        where id = v_id and batch_id = p_batch_id;
    end loop;
  end if;

  update public.delivery_batches set status = 'ACCEPTED', accepted_at = now()
    where id = p_batch_id returning * into v_batch;
  return v_batch;
end $function$;

-- 4c) decline_delivery_batch — nothing meaningful happened yet (no GPS pushed,
--     no handoff code used), so decline removes the inert child rows entirely
--     and leaves the batch as a DECLINED audit record for the owner to see. --
CREATE OR REPLACE FUNCTION public.decline_delivery_batch(p_batch_id text)
 RETURNS public.delivery_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_batch public.delivery_batches%rowtype;
  v_count int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_uid is distinct from v_batch.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_batch.status <> 'PENDING_ACCEPTANCE' then raise exception 'INVALID_BATCH_STATE'; end if;

  select count(*) into v_count from public.appointment_deliveries where batch_id = p_batch_id;
  delete from public.appointment_deliveries where batch_id = p_batch_id;

  update public.delivery_batches set status = 'DECLINED'
    where id = p_batch_id returning * into v_batch;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    select b.owner_user_id, 'QUEUE_UPDATE', 'Delivery run declined',
           'Your agent declined ' || v_count || ' ' || (case when v_count = 1 then 'delivery' else 'deliveries' end) || ' — please reassign.',
           '/business/' || v_batch.business_id || '/manage/appointments'
    from public.businesses b where b.id = v_batch.business_id;
  exception when others then null; end;

  return v_batch;
end $function$;

-- 4d) update_delivery_batch_position — pure GPS push for the whole run,
--     separate from discrete stop-status transitions. -----------------------
CREATE OR REPLACE FUNCTION public.update_delivery_batch_position(
  p_batch_id text, p_lat double precision, p_lng double precision,
  p_accuracy double precision DEFAULT NULL, p_heading double precision DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90 or p_lat > 90 then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;
  update public.delivery_batches
     set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading
   where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED','IN_PROGRESS');
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $function$;

-- 5) appointment_update_delivery_status — batch-gated, auto-progresses the
--    batch, and inserts the "out for delivery" / "delivered" notification
--    that this RPC never sent before. ----------------------------------------
CREATE OR REPLACE FUNCTION public.appointment_update_delivery_status(
  p_delivery_id text, p_status text,
  p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
 RETURNS public.appointment_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_old_status text;
  v_new text;
  v_batch public.delivery_batches%rowtype;
  v_customer text;
  v_remaining int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_status not in ('LEAVING','ON_THE_WAY','ARRIVED','DONE') then raise exception 'INVALID_LIVE_STATUS'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.status in ('DELIVERED','CANCELLED') then raise exception 'INVALID_TRANSITION'; end if;
  if p_status = 'DONE' and v_row.handoff_code is not null and not v_row.handoff_verified then
    raise exception 'HANDOFF_NOT_VERIFIED';
  end if;

  v_old_status := v_row.status;

  if v_row.batch_id is not null then
    select * into v_batch from public.delivery_batches where id = v_row.batch_id for update;
    if v_batch.status not in ('ACCEPTED','IN_PROGRESS') then
      raise exception 'BATCH_NOT_ACCEPTED';
    end if;
  end if;

  v_new := case when p_status in ('LEAVING','ON_THE_WAY') then 'EN_ROUTE'
                when p_status = 'ARRIVED' then 'ARRIVED'
                when p_status = 'DONE' then 'DELIVERED' end;

  update public.appointment_deliveries
     set live_status = p_status, status = v_new,
         lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         delivered_at = case when p_status = 'DONE' then now() else delivered_at end
   where id = p_delivery_id returning * into v_row;

  if v_batch.id is not null then
    if v_batch.status = 'ACCEPTED' and v_new = 'EN_ROUTE' then
      update public.delivery_batches set status = 'IN_PROGRESS' where id = v_batch.id;
    end if;
    if v_new in ('DELIVERED','CANCELLED') then
      select count(*) into v_remaining from public.appointment_deliveries
        where batch_id = v_batch.id and status not in ('DELIVERED','CANCELLED');
      if v_remaining = 0 then
        update public.delivery_batches set status = 'COMPLETED', completed_at = now() where id = v_batch.id;
      end if;
    end if;
  end if;

  select a.customer_user_id into v_customer from public.appointments a where a.id = v_row.appointment_id;
  if v_customer is not null then
    begin
      if v_new = 'EN_ROUTE' and v_old_status is distinct from 'EN_ROUTE' then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_customer, 'DELIVERY', 'Your order is out for delivery',
                'Your delivery agent is on the way.', '/appointments');
      elsif v_new = 'DELIVERED' then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_customer, 'DELIVERY', 'Delivered ✓', 'Your order has been delivered.', '/appointments');
      end if;
    exception when others then null; end;
  end if;

  return v_row;
end $function$;

-- 6) appointment_create — accept fulfillment type + delivery address ---------
-- Same widen-in-place hazard as 20260835's own comment: drop the pre-fulfillment
-- signature first so this replaces rather than overloads it.
DROP FUNCTION IF EXISTS public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb);
CREATE OR REPLACE FUNCTION public.appointment_create(
  p_target_type text, p_target_id text, p_scheduled_for timestamptz,
  p_date_label text, p_time_label text, p_notes text DEFAULT NULL,
  p_photo_url text DEFAULT NULL, p_package_id text DEFAULT NULL,
  p_package_name text DEFAULT NULL, p_package_price numeric DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_fulfillment_type text DEFAULT 'IN_STORE',
  p_delivery_address_line text DEFAULT NULL,
  p_delivery_lat double precision DEFAULT NULL,
  p_delivery_lng double precision DEFAULT NULL
) RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_customer_name text;
  v_customer_avatar text;
  v_appointment public.appointments%rowtype;
  v_items jsonb := p_items;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;
  if p_fulfillment_type not in ('IN_STORE', 'DELIVERY') then raise exception 'INVALID_FULFILLMENT_TYPE'; end if;
  if p_fulfillment_type = 'DELIVERY' and (p_delivery_lat is null or p_delivery_lng is null) then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image
    into v_owner, v_target_name, v_target_avatar
    from public.businesses b where b.id = p_target_id;
  else
    select p.user_id, p.display_name, p.avatar
    into v_owner, v_target_name, v_target_avatar
    from public.providers p where p.id = p_target_id;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_customer_name, v_customer_avatar
  from public.users u where u.id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price, status,
    fulfillment_type, delivery_address_line, delivery_lat, delivery_lng
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, 'PENDING',
    p_fulfillment_type, nullif(trim(coalesce(p_delivery_address_line, '')), ''), p_delivery_lat, p_delivery_lng
  ) returning * into v_appointment;

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', coalesce(p_package_price, 0),
      'quantity', 1
    ));
  end if;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
    insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
    select v_appointment.id, x.catalog_item_id, coalesce(x.item_name, 'Item'), coalesce(x.unit_price, 0), x.quantity
    from jsonb_to_recordset(v_items) as x(catalog_item_id text, item_name text, unit_price numeric, quantity int)
    where coalesce(x.quantity, 0) > 0;

    perform public.reserve_catalog_items(v_items);
  end if;

  return v_appointment;
end
$$;

REVOKE ALL ON FUNCTION public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text, double precision, double precision) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.appointment_create(text, text, timestamptz, text, text, text, text, text, text, numeric, jsonb, text, text, double precision, double precision) TO authenticated;

-- 7) get_tracking — add stops_before + destination coords (for a real ETA
--    instead of the previous hardcoded "~8 min away"), prefer the batch's
--    live position over the stop's own (possibly stale, pre-batch) lat/lng. -
-- Same return-type-widening constraint as my_deliveries below: the existing
-- 6-column version has to be dropped before the 9-column one can be created.
-- Dropped and recreated in one transaction, so the public /track/:token page
-- never observes a missing function.
DROP FUNCTION IF EXISTS public.get_tracking(text);
CREATE OR REPLACE FUNCTION public.get_tracking(p_token text)
 RETURNS TABLE(agreement_id text, provider_lat double precision, provider_lng double precision,
               live_status text, provider_name text, provider_avatar text, stops_before int,
               dest_lat double precision, dest_lng double precision)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select a.id, a.provider_lat, a.provider_lng, a.live_status, u.name, u.avatar, null::int,
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.agreements a on a.id = t.agreement_id
  left join public.users u on u.id = a.responder_user_id
  where t.id::text = p_token and t.expires_at > now() and t.agreement_id is not null
  union all
  select d.appointment_id,
         coalesce(batch.lat, d.lat), coalesce(batch.lng, d.lng),
         d.live_status, u.name, u.avatar,
         (select count(*)::int from public.appointment_deliveries d2
            where d2.batch_id = d.batch_id and d.batch_id is not null
              and d2.stop_order is not null and d.stop_order is not null
              and d2.stop_order < d.stop_order
              and d2.status not in ('DELIVERED','CANCELLED')),
         a2.delivery_lat, a2.delivery_lng
  from public.tracking_tokens t
  join public.appointment_deliveries d
    on d.appointment_id = t.appointment_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
  left join public.users u on u.id = d.agent_user_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  left join public.appointments a2 on a2.id = d.appointment_id
  where t.id::text = p_token and t.expires_at > now() and t.appointment_id is not null;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_delivery_batch(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery_batch(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_delivery_batch(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_batch_position(text, double precision, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_update_delivery_status(text, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tracking(text) TO anon, authenticated;

-- 8) my_deliveries — surface batch_id/stop_order/batch_status so the console
--    can group stops into a run and gate the accept/decline prompt. ---------
-- Widening a RETURNS TABLE is a return-type change, which CREATE OR REPLACE
-- rejects ("cannot change return type of existing function") — the previous
-- 17-column version must be dropped first. Same transaction, so there's no
-- window where the RPC is missing.
DROP FUNCTION IF EXISTS public.my_deliveries();
CREATE OR REPLACE FUNCTION public.my_deliveries()
RETURNS TABLE(
  id text, appointment_id text, business_id text, business_name text,
  customer_name text, customer_area text, delivery_address_line text,
  delivery_lat double precision, delivery_lng double precision,
  scheduled_for timestamptz, date_label text, time_label text,
  status text, live_status text,
  handoff_code text, handoff_verified boolean, lat double precision, lng double precision,
  batch_id text, stop_order int, batch_status text, batch_lat double precision, batch_lng double precision,
  created_at timestamptz, delivered_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select d.id, d.appointment_id, d.business_id, b.name,
    case when d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
         then coalesce(a.customer_name, cu.name, 'Customer')
         else coalesce(cu.alias, 'Customer') end,
    cu.area, a.delivery_address_line, a.delivery_lat, a.delivery_lng,
    a.scheduled_for, a.date_label, a.time_label,
    d.status, d.live_status,
    null::text,               -- handoff_code hidden from the agent (verify-by-ask)
    d.handoff_verified, d.lat, d.lng,
    d.batch_id, d.stop_order, batch.status, batch.lat, batch.lng,
    d.created_at, d.delivered_at
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.businesses b on b.id = d.business_id
  left join public.users cu on cu.id = a.customer_user_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where d.agent_user_id = (auth.uid())::text
  order by
    case d.status when 'EN_ROUTE' then 0 when 'ARRIVED' then 1 when 'ASSIGNED' then 2 else 3 end,
    coalesce(d.stop_order, 999),
    coalesce(a.scheduled_for, d.created_at) desc;
$function$;

GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated;
