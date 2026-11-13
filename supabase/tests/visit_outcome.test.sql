-- Behaviour test for 20261015_visit_outcome.sql. Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_VISIT_OUTCOME_CHECKS_PASSED
-- Uses two appointment rows and moves them between checks as postgres, to stay under the daily booking limit.
create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
end $f$;

create or replace function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $f$
begin
  if p_ok is not true then raise exception 'CHECK FAILED: %', p_msg; end if;
end $f$;

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
  v_slot text; v_dlv text;
  v_e text;
begin
  select id::text into v_owner from auth.users where phone = '919111111111';
  select id::text into v_cust  from auth.users where phone = '919222222222';
  perform pg_temp.chk(v_owner is not null and v_cust is not null, 'the test accounts exist');

  insert into public.appointments (target_type, target_id, target_owner_user_id, customer_user_id, scheduled_for, status, fulfillment_type)
  values ('BUSINESS', v_biz, v_owner, v_cust, now() - interval '1 hour', 'ACCEPTED', 'IN_STORE') returning id into v_slot;
  insert into public.appointments (target_type, target_id, target_owner_user_id, customer_user_id, scheduled_for, status, fulfillment_type)
  values ('BUSINESS', v_biz, v_owner, v_cust, now() - interval '1 hour', 'ACCEPTED', 'DELIVERY') returning id into v_dlv;

  -- the clock no longer completes a visit an hour after it started
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  perform public.sweep_my_appointments();
  execute 'reset role';
  perform pg_temp.chk((select status from public.appointments where id = v_slot) = 'ACCEPTED', 'a visit 1 h in is not auto-completed');

  -- the shop can mark a no-show straight from ACCEPTED
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  perform public.appointment_transition(v_slot, 'NO_SHOW');
  execute 'reset role';
  perform pg_temp.chk((select status from public.appointments where id = v_slot) = 'NO_SHOW', 'ACCEPTED -> NO_SHOW by the shop');

  -- … or Done
  update public.appointments set status = 'ACCEPTED' where id = v_slot;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  perform public.appointment_transition(v_slot, 'COMPLETED');
  perform pg_temp.chk((select status from public.appointments where id = v_slot) = 'COMPLETED', 'ACCEPTED -> COMPLETED by the shop');
  -- and still correct it afterwards
  perform public.appointment_transition(v_slot, 'NO_SHOW');
  perform pg_temp.chk((select status from public.appointments where id = v_slot) = 'NO_SHOW', 'COMPLETED -> NO_SHOW still allowed');

  -- the customer cannot record the outcome
  perform pg_temp.as_user(v_cust);
  execute 'reset role';
  update public.appointments set status = 'ACCEPTED' where id = v_slot;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  v_e := pg_temp.err(format('select public.appointment_transition(%L, ''COMPLETED'')', v_slot));
  perform pg_temp.chk(v_e = 'INVALID_TRANSITION', 'the customer cannot mark it done (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';

  -- not before the visit
  update public.appointments set scheduled_for = now() + interval '2 days' where id = v_slot;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  v_e := pg_temp.err(format('select public.appointment_transition(%L, ''COMPLETED'')', v_slot));
  perform pg_temp.chk(v_e = 'VISIT_NOT_STARTED', 'Done refused two days early (' || coalesce(v_e, 'it worked') || ')');
  v_e := pg_temp.err(format('select public.appointment_transition(%L, ''NO_SHOW'')', v_slot));
  perform pg_temp.chk(v_e = 'VISIT_NOT_STARTED', 'No-show refused before the slot (' || coalesce(v_e, 'it worked') || ')');
  -- a delivery order is never "done" by the shop
  v_e := pg_temp.err(format('select public.appointment_transition(%L, ''COMPLETED'')', v_dlv));
  perform pg_temp.chk(v_e = 'INVALID_TRANSITION', 'a delivery order is not completed by the shop (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';

  -- the fallback: 6 h after the start, an untouched booking completes, from either sweep
  update public.appointments set scheduled_for = now() - interval '7 hours' where id = v_slot;
  perform public.sweep_stale_appointments();
  perform pg_temp.chk((select status from public.appointments where id = v_slot) = 'COMPLETED', 'the timer completes it after 6 h');
  perform pg_temp.chk((select status from public.appointments where id = v_dlv) = 'ACCEPTED', 'the timer leaves delivery orders alone');
  update public.appointments set status = 'ACCEPTED' where id = v_slot;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  perform public.sweep_my_appointments();
  execute 'reset role';
  perform pg_temp.chk((select status from public.appointments where id = v_slot) = 'COMPLETED', 'the caller''s sweep does the same after 6 h');

  -- clients cannot call the global sweep
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  v_e := pg_temp.err('select public.sweep_stale_appointments()');
  perform pg_temp.chk(v_e like 'permission denied%', 'the global sweep is not callable by clients (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';

  raise exception 'ALL_VISIT_OUTCOME_CHECKS_PASSED';
end $test$;
