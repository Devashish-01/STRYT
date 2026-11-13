-- Behaviour test for 20261013_queue_token_transitions.sql. Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_QUEUE_TOKEN_CHECKS_PASSED
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
  v_t text; v_t2 text;
  v_e text;
begin
  select id::text into v_owner from auth.users where phone = '919111111111';
  select id::text into v_cust  from auth.users where phone = '919222222222';
  perform pg_temp.chk(v_owner is not null and v_cust is not null, 'the test accounts exist');

  insert into public.queue_settings (business_id, is_open) values (v_biz, true)
    on conflict (business_id) do update set is_open = true;
  insert into public.queue_tokens (business_id, customer_user_id, customer_name) values (v_biz, v_cust, 'Test')
    returning id into v_t;

  -- ── #41: the customer can claim, and undo their own unconfirmed claim ──
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  update public.queue_tokens set payment_status = 'PENDING_CONFIRM', payment_method = 'UPI', payment_amount = 100 where id = v_t;
  update public.queue_tokens set payment_status = 'UNPAID' where id = v_t and payment_status = 'PENDING_CONFIRM';
  perform pg_temp.chk((select payment_status from public.queue_tokens where id = v_t) = 'UNPAID', 'the customer undid their claim (#41)');
  v_e := pg_temp.err(format('update public.queue_tokens set payment_status = ''PAID'' where id = %L', v_t));
  perform pg_temp.chk(v_e = 'PAYMENT_STATUS_NOT_YOURS_TO_SET', 'the customer cannot mark it paid (' || coalesce(v_e, 'it worked') || ')');
  update public.queue_tokens set payment_status = 'PENDING_CONFIRM', payment_method = 'UPI', payment_amount = 100 where id = v_t;

  -- the shop confirms; after that the customer cannot touch the payment
  perform pg_temp.as_user(v_owner);
  update public.queue_tokens set payment_status = 'PAID' where id = v_t;
  perform pg_temp.as_user(v_cust);
  v_e := pg_temp.err(format('update public.queue_tokens set payment_status = ''UNPAID'' where id = %L', v_t));
  perform pg_temp.chk(v_e = 'PAYMENT_STATUS_NOT_YOURS_TO_SET', 'a confirmed payment cannot be undone (' || coalesce(v_e, 'it worked') || ')');
  v_e := pg_temp.err(format('update public.queue_tokens set payment_amount = 1 where id = %L', v_t));
  perform pg_temp.chk(v_e = 'PAYMENT_STATUS_NOT_YOURS_TO_SET', 'the customer cannot edit a confirmed amount (' || coalesce(v_e, 'it worked') || ')');
  perform pg_temp.as_user(v_owner);
  v_e := pg_temp.err(format('update public.queue_tokens set payment_status = ''UNPAID'' where id = %L', v_t));
  perform pg_temp.chk(v_e = 'PAYMENT_STATUS_NOT_YOURS_TO_SET', 'the shop cannot un-pay a confirmed payment either (' || coalesce(v_e, 'it worked') || ')');

  -- ── #42: the shop follows the line ──
  update public.queue_tokens set status = 'CALLED' where id = v_t and status = 'WAITING';
  perform pg_temp.chk((select status from public.queue_tokens where id = v_t) = 'CALLED', 'the shop calls the customer');
  v_e := pg_temp.err(format('update public.queue_tokens set status = ''WAITING'' where id = %L', v_t));
  perform pg_temp.chk(v_e = 'QUEUE_STATUS_NOT_YOURS_TO_SET', 'CALLED -> WAITING refused (' || coalesce(v_e, 'it worked') || ')');
  update public.queue_tokens set arrived_at = now() where id = v_t;
  update public.queue_tokens set status = 'SERVED' where id = v_t;
  v_e := pg_temp.err(format('update public.queue_tokens set status = ''WAITING'' where id = %L', v_t));
  perform pg_temp.chk(v_e = 'QUEUE_STATUS_NOT_YOURS_TO_SET', 'SERVED -> WAITING refused for the shop (' || coalesce(v_e, 'it worked') || ')');

  -- the customer cannot rewrite a served visit as "left" (payment cleared first, so the
  -- older "payment in progress" rule in enforce_queue_cancel_rules is not what refuses it)
  execute 'reset role';
  update public.queue_tokens set payment_status = 'UNPAID' where id = v_t;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  v_e := pg_temp.err(format('update public.queue_tokens set status = ''LEFT'' where id = %L', v_t));
  perform pg_temp.chk(v_e = 'QUEUE_STATUS_NOT_YOURS_TO_SET', 'SERVED -> LEFT refused for the customer (' || coalesce(v_e, 'it worked') || ')');
  v_e := pg_temp.err(format('update public.queue_tokens set business_id = ''elsewhere'' where id = %L', v_t));
  perform pg_temp.chk(v_e = 'IMMUTABLE_FIELD', 'the token cannot move shop (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';

  -- a fresh token: the customer may still leave the line, and an expired one stays expired
  insert into public.queue_tokens (business_id, customer_user_id, customer_name) values (v_biz, v_cust, 'Test 2')
    returning id into v_t2;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  update public.queue_tokens set status = 'LEFT' where id = v_t2;
  perform pg_temp.chk((select status from public.queue_tokens where id = v_t2) = 'LEFT', 'the customer can leave the line');
  execute 'reset role';
  update public.queue_tokens set status = 'EXPIRED' where id = v_t2;          -- as the sweep would
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  v_e := pg_temp.err(format('update public.queue_tokens set status = ''CALLED'' where id = %L', v_t2));
  perform pg_temp.chk(v_e = 'QUEUE_STATUS_NOT_YOURS_TO_SET', 'EXPIRED -> CALLED refused (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';

  raise exception 'ALL_QUEUE_TOKEN_CHECKS_PASSED';
end $test$;
