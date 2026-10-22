-- Delivery lifecycle behaviour test.  NOT a migration: it never persists anything.
--
-- What it does: replays a whole home-delivery order — place, accept, pack, assign, pick up, start, arrive, hand over, pay, deliver — plus
-- the cases that used to go wrong (the clock closing a live order, reassign leaving stale state, pick-up before packing, flooding a shop,
-- stock never returned, a stuck order) as the three test users, checking the result after each step. It ends by raising an exception, so
-- the whole transaction — fixtures included — rolls back. A pass reads:   ALL_DELIVERY_CHECKS_PASSED   (any failure reads CHECK FAILED: …).
--
-- Needs the three test accounts (9111111111 owner, 9222222222 customer, 9333333333 rider) and the test shop, and migration 20261005
-- applied. To check the migration BEFORE applying it, run the migration and this file together in one query (the migration's changes roll
-- back with the rest). Run it in the Supabase SQL editor, or through the SQL tool, against production: it leaves no trace.

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
end $f$;

create or replace function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $f$
begin
  if p_ok is not true then raise exception 'CHECK FAILED: %', p_msg; end if;
end $f$;

-- Runs a statement as the current user and returns the error text it raised ('' if it succeeded).
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return '';
exception when others then
  return sqlerrm;
end $f$;

do $test$
declare
  v_biz constant text := 'b_deliverytest00000000000000000001';
  v_owner text; v_cust text; v_rider text;
  a1 public.appointments; a2 public.appointments; a3 public.appointments; a4 public.appointments; a5 public.appointments;
  a6 public.appointments; a7 public.appointments; a8 public.appointments; s1 public.appointments;
  d public.appointment_deliveries;
  v_code text; v_code2 text; v_n integer; v_txt text; v_batch public.delivery_batches; v_qty numeric;
  v_item constant text := 'ci_test_finite_1';
begin
  select id::text into v_owner from auth.users where phone = '919111111111';
  select id::text into v_cust  from auth.users where phone = '919222222222';
  select id::text into v_rider from auth.users where phone = '919333333333';
  perform pg_temp.chk(v_owner is not null and v_cust is not null and v_rider is not null, 'the three test accounts exist');
  perform pg_temp.chk(exists (select 1 from public.businesses where id = v_biz), 'the test shop exists');

  -- Fixture: delivery on, a short prep time, no minimum, ₹30 fee, large radius.
  update public.businesses set delivery_enabled = true, is_open_now = true, delivery_prep_min = 2, min_order_amount = 0,
         delivery_fee = 30, free_delivery_above = null, delivery_radius_km = 50, delivery_proof_allowed = false where id = v_biz;
  -- The shop's catalog as the seed script created it (the test prices against these).
  update public.catalog_items set sale_price = null, stock_status = 'IN_STOCK', inventory_type = 'INFINITE', price = v.p
    from (values ('ci_deliverytest_1', 70), ('ci_deliverytest_2', 45), ('ci_deliverytest_3', 90), ('ci_deliverytest_4', 135),
                 ('ci_deliverytest_5', 165), ('ci_deliverytest_6', 265), ('ci_deliverytest_7', 640)) as v(id, p)
   where catalog_items.id = v.id and catalog_items.business_id = v_biz;
  -- Start from a clean slate for this customer so the open-order cap is predictable.
  update public.appointments set status = 'CANCELLED', cancelled_by = 'SYSTEM' where customer_user_id = v_cust and status in ('PENDING', 'ACCEPTED');

  ------------------------------------------------------------------------------------------------------------------------
  -- 0. Hand-over codes
  ------------------------------------------------------------------------------------------------------------------------
  select count(distinct public.new_handoff_code()) into v_n from generate_series(1, 200);
  perform pg_temp.chk(v_n > 150, 'hand-over codes vary (' || v_n || ' distinct of 200)');
  perform pg_temp.chk((select bool_and(public.new_handoff_code() ~ '^[0-9]{6}$') from generate_series(1, 200)), 'hand-over codes are always 6 digits');

  ------------------------------------------------------------------------------------------------------------------------
  -- 1. THE BUG: the clock must not close a live delivery order (D1, D2)
  ------------------------------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(v_cust);
  a1 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '1 hour',
          p_date_label => 'Today', p_time_label => 'ASAP', p_package_id => 'ci_deliverytest_6', p_package_name => 'Atta', p_package_price => 265,
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop', p_asap => true);
  perform pg_temp.chk(a1.status = 'PENDING' and a1.is_asap and a1.delivery_fee = 30, 'ASAP delivery order is created PENDING with the fee');

  -- time passes: its promised time is now in the past
  update public.appointments set scheduled_for = now() - interval '9 minutes' where id = a1.id;
  perform pg_temp.as_user(v_cust);  perform public.sweep_my_appointments();
  perform pg_temp.as_user(v_owner); perform public.sweep_my_appointments();
  perform pg_temp.chk((select status from public.appointments where id = a1.id) = 'PENDING', 'a PENDING ASAP order is NOT cancelled by the clock');

  perform pg_temp.as_user(v_owner);
  perform public.appointment_accept_with_eta(a1.id, '30 min');
  perform pg_temp.chk((select status from public.appointments where id = a1.id) = 'ACCEPTED', 'owner accepts');
  perform pg_temp.as_user(v_cust);  perform public.sweep_my_appointments();
  perform pg_temp.as_user(v_owner); perform public.sweep_my_appointments();
  perform pg_temp.chk((select status from public.appointments where id = a1.id) = 'ACCEPTED',
                      'an ACCEPTED delivery order past its time is NOT completed by the clock (the reported bug)');

  -- control: ordinary slot bookings still follow the old rules
  perform pg_temp.as_user(v_cust);
  s1 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '3 hours',
          p_date_label => 'Today', p_time_label => '9:00 PM', p_package_id => 'ci_deliverytest_1', p_package_name => 'Milk', p_package_price => 70,
          p_fulfillment_type => 'IN_STORE', p_party_size => 1, p_target_package_key => 'shop');
  update public.appointments set status = 'ACCEPTED' where id = s1.id;
  update public.appointments set scheduled_for = now() - interval '1 minute' where id = s1.id;
  perform public.sweep_my_appointments();
  perform pg_temp.chk((select status from public.appointments where id = s1.id) = 'COMPLETED', 'an accepted in-store booking whose time passed is still completed by the sweep');

  a2 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '5 hours',
          p_date_label => 'Today', p_time_label => '10:00 PM', p_package_id => 'ci_deliverytest_1', p_package_name => 'Milk', p_package_price => 70,
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop');
  update public.appointments set scheduled_for = now() - interval '2 minutes' where id = a2.id;
  perform public.sweep_my_appointments();
  perform pg_temp.chk((select status from public.appointments where id = a2.id) = 'CANCELLED', 'a scheduled delivery nobody answered by its slot is still cancelled');
  update public.appointments set status = 'CANCELLED' where id = a2.id and status <> 'CANCELLED';

  ------------------------------------------------------------------------------------------------------------------------
  -- 2. Pack, dispatch, and the pick-up gate
  ------------------------------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(v_owner);
  perform public.mark_order_ready(a1.id);
  perform pg_temp.chk((select ready_at from public.appointments where id = a1.id) is not null, 'Mark packed stamps ready_at');
  perform pg_temp.chk((select status from public.appointments where id = a1.id) = 'ACCEPTED', 'Mark packed does not change the status');

  -- a second order, accepted but NOT packed
  perform pg_temp.as_user(v_cust);
  a3 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '1 hour',
          p_date_label => 'Today', p_time_label => 'ASAP', p_package_id => 'ci_deliverytest_4', p_package_name => 'Oil', p_package_price => 135,
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop', p_asap => true);
  update public.appointments set scheduled_for = now() - interval '8 minutes' where id = a3.id;
  perform pg_temp.as_user(v_owner);
  perform public.appointment_accept_with_eta(a3.id, '30 min');
  perform public.assign_delivery(a3.id, v_rider);
  perform pg_temp.chk((select count(*) from public.notifications where user_id = v_cust and title = 'Delivery partner assigned'
                        and metadata->>'appointmentId' = a3.id) = 1, 'the customer is told a delivery partner was assigned');
  perform pg_temp.as_user(v_rider);
  v_txt := pg_temp.err(format('select public.delivery_mark_picked_up(%L)', (select id from public.appointment_deliveries where appointment_id = a3.id)));
  perform pg_temp.chk(v_txt like '%ORDER_NOT_READY%', 'a rider cannot pick up an order the shop has not packed (' || v_txt || ')');
  perform pg_temp.as_user(v_owner);
  perform public.mark_order_ready(a3.id);
  perform pg_temp.as_user(v_rider);
  perform public.delivery_mark_picked_up((select id from public.appointment_deliveries where appointment_id = a3.id));
  perform pg_temp.chk((select picked_up_at from public.appointment_deliveries where appointment_id = a3.id) is not null, 'pick-up works once packed');

  -- the customer can no longer cancel once the rider has it
  perform pg_temp.as_user(v_cust);
  v_txt := pg_temp.err(format('select public.appointment_transition(%L, ''CANCELLED'')', a3.id));
  perform pg_temp.chk(v_txt like '%DELIVERY_IN_PROGRESS%', 'customer cannot cancel after pick-up (' || v_txt || ')');

  ------------------------------------------------------------------------------------------------------------------------
  -- 3. Reassign starts the delivery over (D5) and stands the old rider down
  ------------------------------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(v_rider);
  perform public.appointment_update_delivery_status((select id from public.appointment_deliveries where appointment_id = a3.id), 'ON_THE_WAY', 12.95, 77.71);
  perform pg_temp.chk((select status from public.appointment_deliveries where appointment_id = a3.id) = 'EN_ROUTE', 'rider starts');
  select handoff_code into v_code from public.appointment_deliveries where appointment_id = a3.id;
  perform pg_temp.as_user(v_owner);
  perform public.assign_delivery(a3.id, v_owner);     -- owner takes it over himself
  select * into d from public.appointment_deliveries where appointment_id = a3.id and status = 'ASSIGNED';
  perform pg_temp.chk(d.agent_user_id = v_owner, 'reassigned to the new rider');
  perform pg_temp.chk(d.picked_up_at is null and d.started_at is null and d.arrived_at is null and d.live_status is null and d.lat is null,
                      'reassign clears the previous rider''s pick-up / start / position');
  perform pg_temp.chk(d.handoff_code is distinct from v_code, 'reassign issues a new code');
  perform pg_temp.chk((select count(*) from public.notifications where user_id = v_rider and title like 'Delivery reassigned%') = 1, 'the old rider is told');
  perform public.assign_delivery(a3.id, v_owner);     -- same rider again: nothing changes
  perform pg_temp.chk((select count(*) from public.appointment_deliveries where appointment_id = a3.id) = 1, 'choosing the same rider is a no-op');
  perform pg_temp.chk((select count(*) from public.order_events where appointment_id = a3.id and event = 'DELIVERY_REASSIGNED') = 1, 'the reassignment is in the audit log');
  -- the owner delivering his own order needs no pick-up wait (but it is packed here anyway) — now put the order back with the rider
  update public.appointment_deliveries set status = 'CANCELLED', cancelled_by = 'SYSTEM', cancel_reason = 'OTHER' where appointment_id = a3.id and status = 'ASSIGNED';
  update public.appointments set status = 'CANCELLED', cancelled_by = 'SYSTEM' where id = a3.id;

  ------------------------------------------------------------------------------------------------------------------------
  -- 4. The whole happy path on a1 (packed above): assign → pick up → start → arrive → code → cash → delivered
  ------------------------------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(v_owner);
  perform public.assign_delivery(a1.id, v_rider);
  select * into d from public.appointment_deliveries where appointment_id = a1.id;
  perform pg_temp.chk(d.status = 'ASSIGNED' and d.handoff_code ~ '^[0-9]{6}$', 'a1 assigned with a 6-digit code');
  v_code := d.handoff_code;

  perform pg_temp.as_user(v_rider);
  perform public.delivery_mark_picked_up(d.id);
  perform public.appointment_update_delivery_status(d.id, 'ON_THE_WAY', 12.951, 77.714);
  perform public.update_delivery_position(d.id, 12.9512, 77.7142, 5, 90);
  perform pg_temp.chk((select lat from public.appointment_deliveries where id = d.id) is not null, 'position is recorded while en route');
  perform public.appointment_update_delivery_status(d.id, 'ARRIVED', 12.9513, 77.7143);
  perform pg_temp.chk(public.confirm_handoff(d.id, case when v_code = '000000' then '000001' else '000000' end) = false, 'a wrong code is refused');
  perform pg_temp.chk(public.confirm_handoff(d.id, v_code) = true, 'the right code is accepted');
  perform pg_temp.chk(public.delivery_collect_cash(d.id) = 295, 'cash due is price + fee');
  perform public.appointment_update_delivery_status(d.id, 'DONE', 12.9513, 77.7143);

  select * into d from public.appointment_deliveries where id = d.id;
  perform pg_temp.chk(d.status = 'DELIVERED' and d.delivered_at is not null, 'delivery is DELIVERED');
  perform pg_temp.chk(d.lat is null and d.lng is null and d.heading is null and d.position_at is null, 'the rider''s position is erased when the delivery ends');
  perform pg_temp.chk((select status from public.appointments where id = a1.id) = 'COMPLETED', 'only now is the order COMPLETED (by the delivery, not the clock)');
  perform pg_temp.chk((select payment_status from public.appointments where id = a1.id) = 'PAID', 'cash collected marks it paid');
  perform pg_temp.chk((select count(*) from public.order_events where appointment_id = a1.id
                         and event in ('ORDER_PLACED','ORDER_ACCEPTED','ORDER_PACKED','DELIVERY_ASSIGNED','DELIVERY_PICKED_UP','DELIVERY_EN_ROUTE',
                                       'DELIVERY_ARRIVED','DELIVERY_HANDOFF_VERIFIED','CASH_COLLECTED','DELIVERY_DELIVERED','ORDER_COMPLETED')) = 11,
                      'every step is in the audit log (got ' || (select count(*) from public.order_events where appointment_id = a1.id) || ' events)');
  perform pg_temp.as_user(v_owner);
  v_txt := pg_temp.err(format('select public.appointment_transition(%L, ''NO_SHOW'')', a1.id));
  perform pg_temp.chk(v_txt like '%INVALID_TRANSITION%', 'a delivered order cannot be marked a no-show (' || v_txt || ')');

  ------------------------------------------------------------------------------------------------------------------------
  -- 5. Stock comes back; flooding is capped; reschedule re-reserves
  ------------------------------------------------------------------------------------------------------------------------
  ------------------------------------------------------------------------------------------------------------------------
  -- 4b. The shop's catalog sets the price, not the app
  ------------------------------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(v_cust);
  v_txt := pg_temp.err($e$select public.appointment_create(p_target_type => 'BUSINESS', p_target_id => 'b_deliverytest00000000000000000001', p_scheduled_for => now() + interval '30 hours',
            p_date_label => 'Today', p_time_label => 'x', p_package_id => 'cart', p_package_name => 'x', p_package_price => 1,
            p_items => '[{"catalog_item_id":"ci_deliverytest_7","item_name":"Rice","unit_price":1,"quantity":1}]'::jsonb,
            p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143, p_party_size => 1, p_target_package_key => 'shop')$e$);
  perform pg_temp.chk(v_txt like '%PRICE_CHANGED%', 'an order whose total does not match the catalog is refused (' || v_txt || ')');

  a2 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '30 hours',
          p_date_label => 'Today', p_time_label => 'x', p_package_id => 'cart', p_package_name => 'Rice',
          p_items => '[{"catalog_item_id":"ci_deliverytest_7","item_name":"FAKE NAME","unit_price":1,"quantity":1}]'::jsonb,
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop');
  perform pg_temp.chk(a2.package_price = 640, 'the order is priced from the catalog (' || a2.package_price || ')');
  perform pg_temp.chk((select unit_price from public.appointment_items where appointment_id = a2.id) = 640
                      and (select item_name from public.appointment_items where appointment_id = a2.id) = 'Basmati Rice 5 kg', 'line price and name come from the catalog, not the caller');
  update public.appointments set status = 'CANCELLED', cancelled_by = 'SYSTEM' where id = a2.id;

  v_txt := pg_temp.err($e$select public.appointment_create(p_target_type => 'BUSINESS', p_target_id => 'b_deliverytest00000000000000000001', p_scheduled_for => now() + interval '31 hours',
            p_date_label => 'Today', p_time_label => 'x', p_package_id => 'cart', p_items => '[{"catalog_item_id":"not_a_real_item","quantity":1}]'::jsonb,
            p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143, p_party_size => 1, p_target_package_key => 'shop')$e$);
  perform pg_temp.chk(v_txt like '%ITEM_NOT_FOUND%', 'an item that is not in the shop''s catalog is refused (' || v_txt || ')');
  v_txt := pg_temp.err($e$select public.appointment_create(p_target_type => 'BUSINESS', p_target_id => 'b_deliverytest00000000000000000001', p_scheduled_for => now() + interval '31 hours',
            p_date_label => 'Today', p_time_label => 'x', p_package_id => 'cart', p_items => '[{"catalog_item_id":"ci_deliverytest_1","quantity":0}]'::jsonb,
            p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143, p_party_size => 1, p_target_package_key => 'shop')$e$);
  perform pg_temp.chk(v_txt like '%INVALID_QUANTITY%', 'a zero quantity is refused (' || v_txt || ')');
  v_txt := pg_temp.err($e$select public.appointment_create(p_target_type => 'BUSINESS', p_target_id => 'b_deliverytest00000000000000000001', p_scheduled_for => now() + interval '31 hours',
            p_date_label => 'Today', p_time_label => 'x', p_package_id => 'cart', p_items => '[{"catalog_item_id":"ci_deliverytest_1","quantity":100}]'::jsonb,
            p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143, p_party_size => 1, p_target_package_key => 'shop')$e$);
  perform pg_temp.chk(v_txt like '%INVALID_QUANTITY%', 'an absurd quantity is refused (' || v_txt || ')');
  v_txt := pg_temp.err($e$select public.appointment_create(p_target_type => 'BUSINESS', p_target_id => 'b_deliverytest00000000000000000001', p_scheduled_for => now() + interval '31 hours',
            p_date_label => 'Today', p_time_label => 'x', p_package_id => 'ci_deliverytest_1', p_package_price => 70,
            p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 95, p_delivery_lng => 77.7143, p_party_size => 1, p_target_package_key => 'shop')$e$);
  perform pg_temp.chk(v_txt like '%INVALID_LOCATION%', 'an impossible latitude is refused (' || v_txt || ')');
  update public.catalog_items set stock_status = 'OUT_OF_STOCK' where id = 'ci_deliverytest_2';
  v_txt := pg_temp.err($e$select public.appointment_create(p_target_type => 'BUSINESS', p_target_id => 'b_deliverytest00000000000000000001', p_scheduled_for => now() + interval '31 hours',
            p_date_label => 'Today', p_time_label => 'x', p_package_id => 'ci_deliverytest_2', p_package_price => 45,
            p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143, p_party_size => 1, p_target_package_key => 'shop')$e$);
  perform pg_temp.chk(v_txt like '%ITEM_UNAVAILABLE%', 'an out-of-stock item cannot be ordered (' || v_txt || ')');

  insert into public.catalog_items (id, business_id, name, description, price, stock_status, sort_order, inventory_type, quantity)
  values (v_item, v_biz, 'Test finite item', 'x', 50, 'IN_STOCK', 99, 'FINITE', 5);

  perform pg_temp.as_user(v_cust);
  a4 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '6 hours',
          p_date_label => 'Today', p_time_label => '11:00 PM', p_items => jsonb_build_array(jsonb_build_object('catalog_item_id', v_item, 'item_name', 'Test finite item', 'unit_price', 50, 'quantity', 2)),
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop');
  select quantity into v_qty from public.catalog_items where id = v_item;
  perform pg_temp.chk(v_qty = 3, 'ordering 2 takes 2 from the stock (3 left)');
  perform pg_temp.as_user(v_owner);
  perform public.appointment_transition(a4.id, 'REJECTED');
  select quantity into v_qty from public.catalog_items where id = v_item;
  perform pg_temp.chk(v_qty = 5, 'declining the order returns the stock (' || v_qty || ')');

  perform pg_temp.as_user(v_cust);
  a5 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '7 hours',
          p_date_label => 'Today', p_time_label => '11:30 PM', p_items => jsonb_build_array(jsonb_build_object('catalog_item_id', v_item, 'item_name', 'Test finite item', 'unit_price', 50, 'quantity', 2)),
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop');
  a6 := public.reschedule_appointment(a5.id, now() + interval '8 hours', 'Today', '12:00 AM');
  select quantity into v_qty from public.catalog_items where id = v_item;
  perform pg_temp.chk(v_qty = 3, 'rescheduling keeps exactly one reservation (' || v_qty || ' left)');
  perform public.appointment_transition(a6.id, 'CANCELLED');
  select quantity into v_qty from public.catalog_items where id = v_item;
  perform pg_temp.chk(v_qty = 5, 'cancelling the replacement returns it all (' || v_qty || ')');

  -- open-order cap: 3 at one shop
  update public.appointments set status = 'CANCELLED', cancelled_by = 'SYSTEM' where customer_user_id = v_cust and status in ('PENDING', 'ACCEPTED');
  for v_n in 1..3 loop
    perform public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + make_interval(hours => 9 + v_n),
            p_date_label => 'Today', p_time_label => 'later ' || v_n, p_package_id => 'ci_deliverytest_1', p_package_name => 'Milk', p_package_price => 70,
            p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
            p_party_size => 1, p_target_package_key => 'shop');
  end loop;
  v_txt := pg_temp.err($e$select public.appointment_create(p_target_type => 'BUSINESS', p_target_id => 'b_deliverytest00000000000000000001', p_scheduled_for => now() + interval '20 hours',
            p_date_label => 'Today', p_time_label => 'later 4', p_package_id => 'ci_deliverytest_1', p_package_name => 'Milk', p_package_price => 70,
            p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
            p_party_size => 1, p_target_package_key => 'shop')$e$);
  perform pg_temp.chk(v_txt like '%TOO_MANY_OPEN_ORDERS%', 'a fourth open delivery order at one shop is refused (' || v_txt || ')');
  update public.appointments set status = 'CANCELLED', cancelled_by = 'SYSTEM' where customer_user_id = v_cust and status in ('PENDING', 'ACCEPTED');

  ------------------------------------------------------------------------------------------------------------------------
  -- 6. A stuck order escalates, then closes — nothing sits open forever
  ------------------------------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(v_cust);
  a7 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '1 hour',
          p_date_label => 'Today', p_time_label => 'ASAP', p_package_id => 'ci_deliverytest_6', p_package_name => 'Atta', p_package_price => 265,
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop', p_asap => true);
  perform pg_temp.as_user(v_owner);
  perform public.appointment_accept_with_eta(a7.id, '30 min');
  update public.appointments set scheduled_for = now() - interval '20 minutes' where id = a7.id;
  perform pg_temp.chk(public.escalate_overdue_delivery_orders() >= 1, 'the escalation job picks up the overdue order');
  perform pg_temp.chk((select count(*) from public.notifications where user_id = v_owner and title like 'Order is overdue%' and metadata->>'appointmentId' = a7.id) = 1, 'the shop is told once');
  perform public.escalate_overdue_delivery_orders();
  perform pg_temp.chk((select count(*) from public.notifications where user_id = v_owner and title like 'Order is overdue%' and metadata->>'appointmentId' = a7.id) = 1, 'and not again');
  perform pg_temp.chk((select status from public.appointments where id = a7.id) = 'ACCEPTED', 'still open after 20 minutes');
  update public.appointments set scheduled_for = now() - interval '4 hours' where id = a7.id;
  perform public.escalate_overdue_delivery_orders();
  perform pg_temp.chk((select status from public.appointments where id = a7.id) = 'CANCELLED' and (select cancelled_by from public.appointments where id = a7.id) = 'SYSTEM',
                      'closed after 3 hours with nobody on the road');
  perform pg_temp.chk((select body from public.notifications where user_id = v_cust and metadata->>'appointmentId' = a7.id and title = 'Booking auto-cancelled'
                        order by created_at desc limit 1) like '%couldn''t complete%', 'the customer is told what really happened');

  ------------------------------------------------------------------------------------------------------------------------
  -- 7. A run: accepting without a route order still numbers the stops
  ------------------------------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(v_cust);
  a8 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '1 hour',
          p_date_label => 'Today', p_time_label => 'ASAP', p_package_id => 'ci_deliverytest_5', p_package_name => 'Dal', p_package_price => 165,
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop', p_asap => true);
  update public.appointments set scheduled_for = now() - interval '6 minutes' where id = a8.id;
  a2 := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '1 hour',
          p_date_label => 'Today', p_time_label => 'ASAP', p_package_id => 'ci_deliverytest_7', p_package_name => 'Rice', p_package_price => 640,
          p_fulfillment_type => 'DELIVERY', p_delivery_address_line => 'Test street', p_delivery_lat => 12.9513, p_delivery_lng => 77.7143,
          p_party_size => 1, p_target_package_key => 'shop', p_asap => true);
  update public.appointments set scheduled_for = now() - interval '6 minutes' where id = a8.id;
  update public.appointments set scheduled_for = now() - interval '7 minutes' where id = a2.id;
  perform pg_temp.as_user(v_owner);
  perform public.appointment_accept_with_eta(a8.id, '30 min');
  perform public.appointment_accept_with_eta(a2.id, '30 min');
  v_batch := public.assign_delivery_batch(array[a8.id, a2.id], v_rider);
  perform pg_temp.as_user(v_rider);
  perform public.accept_delivery_batch(v_batch.id, null::text[]);
  perform pg_temp.chk((select count(*) from public.appointment_deliveries where batch_id = v_batch.id and stop_order is not null) = 2
                      and (select count(distinct stop_order) from public.appointment_deliveries where batch_id = v_batch.id) = 2, 'a run accepted with no route order gets stops 1 and 2');
  select count(*) into v_n from public.my_deliveries() where order_ready_at is null and status = 'ASSIGNED';
  perform pg_temp.chk(v_n = 2, 'the rider''s list says these two are not packed yet (' || v_n || ')');
  perform pg_temp.chk((select bool_and(handoff_code is null) from public.my_deliveries()), 'the rider''s list never contains the code');

  ------------------------------------------------------------------------------------------------------------------------
  -- 8. Row security on the audit log
  ------------------------------------------------------------------------------------------------------------------------
  -- the fixture rider may carry the appointments scope too; narrow them to delivery-only for this check (rolled back)
  update public.business_access_sessions set scopes = array['delivery'] where business_id = v_biz and grantee_user_id = v_rider;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  select count(*) into v_n from public.order_events where appointment_id = a1.id;
  perform pg_temp.chk(v_n > 0, 'the customer can read their own order''s audit log');
  perform pg_temp.as_user(v_rider);
  select count(*) into v_n from public.order_events where appointment_id = a1.id;
  perform pg_temp.chk(v_n = 0, 'a rider with only the delivery scope cannot read the shop''s audit log (' || v_n || ')');
  v_txt := pg_temp.err($e$insert into public.order_events (appointment_id, event) values ('x', 'FORGED')$e$);
  perform pg_temp.chk(v_txt <> '', 'nobody can write to the audit log directly');
  execute 'reset role';

  raise exception 'ALL_DELIVERY_CHECKS_PASSED';
end $test$;
