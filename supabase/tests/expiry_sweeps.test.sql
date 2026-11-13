-- Behaviour test for 20261016_expiry_sweeps.sql. Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_EXPIRY_CHECKS_PASSED
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
  v_owner text; v_viewer text;
  v_share text; v_req text; v_tok text;
  v_exp timestamptz;
  v_lat double precision; v_status text;
  v_e text;
begin
  select id::text into v_owner  from auth.users where phone = '919111111111';   -- shares their location
  select id::text into v_viewer from auth.users where phone = '919222222222';   -- is allowed to see it
  perform pg_temp.chk(v_owner is not null and v_viewer is not null, 'the test accounts exist');

  -- ── a. an approval lasts 24 hours ──
  delete from public.location_share_grants where owner_user_id = v_owner and requester_user_id = v_viewer;
  insert into public.location_share_grants (owner_user_id, requester_user_id, status) values (v_owner, v_viewer, 'PENDING');
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  perform public.respond_location_share(v_viewer, true);
  execute 'reset role';
  select expires_at into v_exp from public.location_share_grants where owner_user_id = v_owner and requester_user_id = v_viewer;
  perform pg_temp.chk(v_exp between now() + interval '23 hours' and now() + interval '25 hours',
    'an approved grant expires in 24 h (' || coalesce(v_exp::text, 'never') || ')');

  -- … and the sweep closes it when that passes
  update public.location_share_grants set expires_at = now() - interval '1 minute'
   where owner_user_id = v_owner and requester_user_id = v_viewer;
  perform public.expire_stale_rows();
  perform pg_temp.chk((select status from public.location_share_grants where owner_user_id = v_owner and requester_user_id = v_viewer) = 'EXPIRED',
    'an expired grant becomes EXPIRED');
  v_e := pg_temp.err(format('update public.location_share_grants set status = ''WHATEVER'' where owner_user_id = %L', v_owner));
  perform pg_temp.chk(v_e like '%location_share_grants_status_check%', 'grant status is constrained (' || coalesce(v_e, 'it worked') || ')');

  -- ── b. a live share shows a position only while it is live ──
  update public.live_shares set status = 'ENDED' where sharer_user_id = v_owner and status = 'ACTIVE';
  insert into public.live_shares (sharer_user_id, lat, lng, expires_at) values (v_owner, 18.52, 73.85, now() + interval '1 hour')
    returning id into v_share;
  insert into public.live_share_recipients (share_id, recipient_user_id) values (v_share, v_viewer);
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_viewer);
  select g.lat, g.status into v_lat, v_status from public.get_live_share(v_share) g;
  perform pg_temp.chk(v_lat = 18.52 and v_status = 'ACTIVE', 'a recipient sees a live share');
  execute 'reset role';

  update public.live_shares set expires_at = now() - interval '1 minute' where id = v_share;   -- 8 h are up
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  perform public.update_live_share(10.0, 10.0);
  perform pg_temp.as_user(v_viewer);
  select g.lat, g.status into v_lat, v_status from public.get_live_share(v_share) g;
  perform pg_temp.chk(v_lat is null and v_status = 'ENDED', 'after expiry the recipient gets no position (' || coalesce(v_lat::text, 'null') || ')');
  execute 'reset role';
  perform pg_temp.chk((select lat from public.live_shares where id = v_share) = 18.52, 'an expired share accepts no new position');

  perform public.expire_stale_rows();
  perform pg_temp.chk((select status from public.live_shares where id = v_share) = 'ENDED', 'the sweep ends an expired share');
  perform pg_temp.chk((select lat is null and lng is null from public.live_shares where id = v_share), 'and clears its position');

  -- a share stopped by hand keeps no position either
  insert into public.live_shares (sharer_user_id, lat, lng, expires_at, status, ended_at)
  values (v_owner, 1, 1, now() + interval '1 hour', 'ENDED', now()) returning id into v_share;
  insert into public.live_share_recipients (share_id, recipient_user_id) values (v_share, v_viewer);
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_viewer);
  select g.lat into v_lat from public.get_live_share(v_share) g;
  perform pg_temp.chk(v_lat is null, 'a stopped share shows no position');
  execute 'reset role';
  perform public.expire_stale_rows();
  perform pg_temp.chk((select lat is null from public.live_shares where id = v_share), 'the sweep clears a stopped share''s position');

  -- ── requests and tokens ──
  insert into public.requests (title, requester_user_id, status, expires_at) values ('Expiry test', v_viewer, 'OPEN', now() - interval '1 minute')
    returning id into v_req;
  insert into public.group_buy_tokens (token_code, agreement_id, request_id, holder_user_id, issuer_user_id, valid_until)
  values ('EXPTEST' || substr(md5(random()::text), 1, 6), 'agr_x', v_req, v_viewer, v_owner, now() - interval '1 minute')
    returning id into v_tok;
  perform public.expire_stale_rows();
  perform pg_temp.chk((select status::text from public.requests where id = v_req) = 'EXPIRED', 'an expired request becomes EXPIRED');
  perform pg_temp.chk((select status from public.group_buy_tokens where id = v_tok) = 'EXPIRED', 'an expired token becomes EXPIRED');

  -- clients cannot run the sweep
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_viewer);
  v_e := pg_temp.err('select public.expire_stale_rows()');
  perform pg_temp.chk(v_e like 'permission denied%', 'the sweep is not callable by clients (' || coalesce(v_e, 'it worked') || ')');
  execute 'reset role';

  raise exception 'ALL_EXPIRY_CHECKS_PASSED';
end $test$;
