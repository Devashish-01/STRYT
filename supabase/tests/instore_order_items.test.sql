-- Behaviour test for 20261007_instore_order_items.sql. Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_INSTORE_ITEM_CHECKS_PASSED
create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
end $f$;

create or replace function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $f$
begin
  if p_ok is not true then raise exception 'CHECK FAILED: %', p_msg; end if;
end $f$;

do $test$
declare
  v_biz constant text := 'b_deliverytest00000000000000000001';
  v_owner text; v_cust text; v_rider text;
  a public.appointments;
  n record;
  v_n integer;
begin
  select id::text into v_owner from auth.users where phone = '919111111111';
  select id::text into v_cust  from auth.users where phone = '919222222222';
  select id::text into v_rider from auth.users where phone = '919333333333';
  perform pg_temp.chk(v_owner is not null and v_cust is not null and v_rider is not null, 'the three test accounts exist');

  update public.catalog_items set stock_status = 'IN_STOCK', inventory_type = 'INFINITE'
   where id in ('ci_deliverytest_6', 'ci_deliverytest_1') and business_id = v_biz;

  -- the customer buys two items in place, sending a meaningless name
  perform pg_temp.as_user(v_cust);
  a := public.appointment_create_walk_in_payment(
         v_biz, 'whatever the app sent', 600, 'UPI', 'REF1',
         jsonb_build_array(
           jsonb_build_object('catalog_item_id', 'ci_deliverytest_6', 'item_name', 'Atta 5 kg', 'unit_price', 265, 'quantity', 2),
           jsonb_build_object('catalog_item_id', 'ci_deliverytest_1', 'item_name', 'Milk', 'unit_price', 70, 'quantity', 1)));
  perform pg_temp.chk(a.package_name = 'Atta 5 kg x2, Milk x1', 'the order is named after its items (' || a.package_name || ')');
  perform pg_temp.chk((select count(*) from public.appointment_items where appointment_id = a.id) = 2, 'both item lines are stored');
  perform pg_temp.chk(a.status = 'ACCEPTED' and a.payment_status = 'PENDING_CONFIRM', 'it is accepted with the payment waiting to be confirmed');

  -- the shop is told it is a purchase to confirm, with the items, and nothing to accept or decline
  select * into n from public.notifications
   where user_id = v_owner and metadata->>'appointmentId' = a.id order by created_at desc limit 1;
  perform pg_temp.chk(n.title = 'Purchase to confirm', 'the shop gets "Purchase to confirm" (' || coalesce(n.title, 'none') || ')');
  perform pg_temp.chk(n.body like '%Atta 5 kg x2, Milk x1%' and n.body like '%UPI%', 'the notification lists the items and the payment method (' || n.body || ')');
  perform pg_temp.chk(not (n.metadata ? 'actions'), 'there is no Accept / Decline on it');
  perform pg_temp.chk((select count(*) from public.notifications where user_id = v_owner and metadata->>'appointmentId' = a.id) = 1, 'exactly one notification');

  -- a single item, paid in cash
  a := public.appointment_create_walk_in_payment(
         v_biz, 'x', 70, 'CASH', null,
         jsonb_build_array(jsonb_build_object('catalog_item_id', 'ci_deliverytest_1', 'item_name', 'Milk', 'unit_price', 70, 'quantity', 1)));
  perform pg_temp.chk(a.package_name = 'Milk x1', 'a single item is named too (' || a.package_name || ')');
  select * into n from public.notifications where user_id = v_owner and metadata->>'appointmentId' = a.id;
  perform pg_temp.chk(n.body like '%paying cash%', 'cash is said to be cash (' || n.body || ')');

  -- a normal booking still gets the booking-request notification, with Accept / Decline
  a := public.appointment_create(p_target_type => 'BUSINESS', p_target_id => v_biz, p_scheduled_for => now() + interval '40 hours',
         p_date_label => 'Later', p_time_label => '10:00 AM', p_package_id => 'ci_deliverytest_1', p_package_name => 'Milk', p_package_price => 70,
         p_fulfillment_type => 'IN_STORE', p_party_size => 1, p_target_package_key => 'shop');
  select * into n from public.notifications where user_id = v_owner and metadata->>'appointmentId' = a.id;
  perform pg_temp.chk(n.title = 'New booking request' and n.metadata ? 'actions', 'a normal booking is unchanged (' || coalesce(n.title, 'none') || ')');

  -- who can read the item lines
  update public.business_access_sessions set scopes = array['appointments'] where business_id = v_biz and grantee_user_id = v_rider;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_rider);
  select count(*) into v_n from public.appointment_items i join public.appointments p on p.id = i.appointment_id where p.target_id = v_biz;
  perform pg_temp.chk(v_n > 0, 'staff with the appointments scope can read the item lines (' || v_n || ')');
  execute 'reset role';
  update public.business_access_sessions set scopes = array['delivery'] where business_id = v_biz and grantee_user_id = v_rider;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_rider);
  select count(*) into v_n from public.appointment_items i join public.appointments p on p.id = i.appointment_id where p.target_id = v_biz;
  perform pg_temp.chk(v_n = 0, 'staff without it cannot (' || v_n || ')');
  perform pg_temp.as_user(v_cust);
  select count(*) into v_n from public.appointment_items i join public.appointments p on p.id = i.appointment_id where p.customer_user_id = v_cust;
  perform pg_temp.chk(v_n > 0, 'the customer can read their own lines');
  execute 'reset role';

  raise exception 'ALL_INSTORE_ITEM_CHECKS_PASSED';
end $test$;
