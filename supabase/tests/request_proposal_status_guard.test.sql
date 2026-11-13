-- Behaviour test for 20261014_request_proposal_status_guard.sql. Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_DEAL_STATUS_CHECKS_PASSED
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
  v_req_user text; v_resp text;
  v_req text; v_req2 text; v_prop text;
  v_e text;
begin
  select id::text into v_req_user from auth.users where phone = '919222222222';   -- asks
  select id::text into v_resp     from auth.users where phone = '919111111111';   -- quotes
  perform pg_temp.chk(v_req_user is not null and v_resp is not null, 'the test accounts exist');

  execute 'set local role authenticated';
  perform pg_temp.as_user(v_req_user);
  insert into public.requests (title, requester_user_id, status) values ('Deal guard test', v_req_user, 'OPEN') returning id into v_req;
  v_e := pg_temp.err(format('insert into public.requests (title, requester_user_id, status) values (''x'', %L, ''COMPLETED'')', v_req_user));
  perform pg_temp.chk(v_e = 'DEAL_STATUS_NEEDS_FUNCTION', 'a request cannot be born COMPLETED (' || coalesce(v_e, 'it worked') || ')');
  v_e := pg_temp.err(format('update public.requests set status = ''COMPLETED'' where id = %L', v_req));
  perform pg_temp.chk(v_e = 'DEAL_STATUS_NEEDS_FUNCTION', 'the requester cannot set status directly (' || coalesce(v_e, 'it worked') || ')');
  update public.requests set title = 'Deal guard test (edited)' where id = v_req;
  perform pg_temp.chk((select title from public.requests where id = v_req) = 'Deal guard test (edited)', 'the requester can still edit the text');

  perform pg_temp.as_user(v_resp);
  v_e := pg_temp.err(format('insert into public.proposals (request_id, responder_user_id, price, status) values (%L, %L, 500, ''ACCEPTED'')', v_req, v_resp));
  perform pg_temp.chk(v_e = 'DEAL_STATUS_NEEDS_FUNCTION', 'a quote cannot be born ACCEPTED (' || coalesce(v_e, 'it worked') || ')');
  insert into public.proposals (request_id, responder_user_id, price, status) values (v_req, v_resp, 500, 'SUBMITTED') returning id into v_prop;
  v_e := pg_temp.err(format('update public.proposals set status = ''ACCEPTED'' where id = %L', v_prop));
  perform pg_temp.chk(v_e = 'DEAL_STATUS_NEEDS_FUNCTION', 'the responder cannot accept their own quote (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';
  insert into public.requests (title, requester_user_id, status) values ('Other', v_req_user, 'OPEN') returning id into v_req2;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_resp);
  v_e := pg_temp.err(format('update public.proposals set request_id = %L where id = %L', v_req2, v_prop));
  perform pg_temp.chk(v_e = 'IMMUTABLE_FIELD', 'a quote cannot be moved to another request (' || coalesce(v_e, 'it worked') || ')');
  update public.proposals set price = 450 where id = v_prop;
  perform pg_temp.chk((select price from public.proposals where id = v_prop) = 450, 'the responder can still change the price of an open quote');

  -- the real door still works
  perform pg_temp.as_user(v_req_user);
  perform public.accept_proposal(v_prop);
  execute 'reset role';
  perform pg_temp.chk((select status::text from public.proposals where id = v_prop) = 'ACCEPTED', 'accept_proposal accepts');
  perform pg_temp.chk((select status::text from public.requests where id = v_req) = 'IN_PROGRESS', 'accept_proposal moves the request on');

  raise exception 'ALL_DEAL_STATUS_CHECKS_PASSED';
end $test$;
