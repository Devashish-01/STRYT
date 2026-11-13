-- Behaviour test for 20261012_appointment_writes_via_functions.sql. Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_APPOINTMENT_WRITE_CHECKS_PASSED
create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
end $f$;

create or replace function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $f$
begin
  if p_ok is not true then raise exception 'CHECK FAILED: %', p_msg; end if;
end $f$;

-- the error text a statement raised, or null if it worked
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $f$;

do $test$
declare
  v_biz constant text := 'b_deliverytest00000000000000000001';
  v_owner text; v_cust text;
  v_id text;
  r public.appointments;
  v_e text;
begin
  select id::text into v_owner from auth.users where phone = '919111111111';
  select id::text into v_cust  from auth.users where phone = '919222222222';
  perform pg_temp.chk(v_owner is not null and v_cust is not null, 'the test accounts exist');

  insert into public.appointments (target_type, target_id, target_owner_user_id, customer_user_id, scheduled_for,
                                   status, payment_status, package_price)
  values ('BUSINESS', v_biz, v_owner, v_cust, now() + interval '30 days', 'CANCELLED', 'UNPAID', 100)
  returning id into v_id;

  -- #39: the shop cannot reopen a cancelled order, or rewrite its money, from the client
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  v_e := pg_temp.err(format('update public.appointments set status = ''ACCEPTED'' where id = %L', v_id));
  perform pg_temp.chk(v_e = 'APPOINTMENT_CHANGE_NEEDS_FUNCTION', 'direct status write refused (' || coalesce(v_e, 'it worked') || ')');
  v_e := pg_temp.err(format('update public.appointments set payment_status = ''PAID'' where id = %L', v_id));
  perform pg_temp.chk(v_e = 'APPOINTMENT_CHANGE_NEEDS_FUNCTION', 'direct payment write refused (' || coalesce(v_e, 'it worked') || ')');
  v_e := pg_temp.err(format('update public.appointments set package_price = 1 where id = %L', v_id));
  perform pg_temp.chk(v_e = 'APPOINTMENT_CHANGE_NEEDS_FUNCTION', 'direct price write refused (' || coalesce(v_e, 'it worked') || ')');
  v_e := pg_temp.err(format('update public.appointments set response_note = ''See you soon'' where id = %L', v_id));
  perform pg_temp.chk(v_e is null, 'a non-state column can still be edited (' || coalesce(v_e, 'ok') || ')');

  -- #40: "save to tab" refuses a cancelled order
  v_e := pg_temp.err(format('select public.appointment_set_unpaid_amount(%L, 250)', v_id));
  perform pg_temp.chk(v_e = 'INVALID_TRANSITION', 'tab refused on a cancelled order (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';

  -- as a function / service role the state can still move
  update public.appointments set status = 'ACCEPTED', payment_status = 'PAID', payment_amount = 100 where id = v_id;
  perform pg_temp.chk((select status from public.appointments where id = v_id) = 'ACCEPTED', 'a non-client role can still write status');

  -- #40: a confirmed payment is never wiped back to unpaid
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  v_e := pg_temp.err(format('select public.appointment_set_unpaid_amount(%L, 250)', v_id));
  perform pg_temp.chk(v_e = 'INVALID_TRANSITION', 'tab refused on a PAID order (' || coalesce(v_e, 'it worked') || ')');
  perform pg_temp.chk((select payment_status from public.appointments where id = v_id) = 'PAID', 'the payment is still PAID');
  execute 'reset role';

  -- #40: an owed order can still go on the tab
  update public.appointments set payment_status = 'REJECTED' where id = v_id;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  r := public.appointment_set_unpaid_amount(v_id, 250);
  perform pg_temp.chk(r.payment_status = 'UNPAID' and r.payment_amount = 250 and r.package_price = 250, 'tab saved on an owed order');
  -- the customer is not a manager
  perform pg_temp.as_user(v_cust);
  v_e := pg_temp.err(format('select public.appointment_set_unpaid_amount(%L, 1)', v_id));
  perform pg_temp.chk(v_e = 'NOT_APPOINTMENT_MANAGER', 'the customer cannot set the tab (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';

  raise exception 'ALL_APPOINTMENT_WRITE_CHECKS_PASSED';
end $test$;
