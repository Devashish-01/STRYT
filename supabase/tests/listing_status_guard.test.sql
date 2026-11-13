-- Behaviour test for 20261011_listing_status_guard.sql. Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_LISTING_STATUS_CHECKS_PASSED
create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
end $f$;

create or replace function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $f$
begin
  if p_ok is not true then raise exception 'CHECK FAILED: %', p_msg; end if;
end $f$;

-- true when the statement is refused by the guard
create or replace function pg_temp.refused(p_sql text) returns boolean language plpgsql as $f$
begin
  execute p_sql;
  return false;
exception when others then
  if sqlerrm = 'LISTING_STATUS_NOT_YOURS_TO_SET' then return true; end if;
  raise;
end $f$;

do $test$
declare
  v_biz constant text := 'b_deliverytest00000000000000000001';
  v_owner text; v_cust text;
  v_prov text := 'p_listingtest_' || substr(md5(random()::text), 1, 8);
  v_cat text := 'cat_listingtest_' || substr(md5(random()::text), 1, 8);
  v_s text;
begin
  select id::text into v_owner from auth.users where phone = '919111111111';
  select id::text into v_cust  from auth.users where phone = '919222222222';
  perform pg_temp.chk(v_owner is not null and v_cust is not null, 'the test accounts exist');
  perform pg_temp.chk((select owner_user_id from public.businesses where id = v_biz) = v_owner, 'the test shop belongs to the owner account');

  -- ── businesses ──────────────────────────────────────────────
  update public.businesses set status = 'PENDING' where id = v_biz;          -- as postgres: allowed
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  perform pg_temp.chk(pg_temp.refused(format('update public.businesses set status = ''ACTIVE'' where id = %L', v_biz)),
    'owner cannot approve their own PENDING business');
  execute 'reset role';

  update public.businesses set status = 'SUSPENDED' where id = v_biz;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  perform pg_temp.chk(pg_temp.refused(format('update public.businesses set status = ''ACTIVE'' where id = %L', v_biz)),
    'owner cannot lift a suspension');
  perform pg_temp.chk(pg_temp.refused(format('update public.businesses set status = ''PENDING'' where id = %L', v_biz)),
    'owner cannot push a suspended business back into review');
  execute 'reset role';

  update public.businesses set status = 'REJECTED' where id = v_biz;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_owner);
  perform pg_temp.chk(pg_temp.refused(format('update public.businesses set status = ''ACTIVE'' where id = %L', v_biz)),
    'owner cannot turn a rejection into ACTIVE');
  update public.businesses set status = 'PENDING', rejection_reason = null where id = v_biz;   -- submitForReview
  select status::text into v_s from public.businesses where id = v_biz;
  perform pg_temp.chk(v_s = 'PENDING', 'owner CAN resubmit a rejected business for review (' || v_s || ')');
  -- other columns still editable while the status stays put
  update public.businesses set description = coalesce(description, '') where id = v_biz;
  perform pg_temp.chk(pg_temp.refused(format(
    'insert into public.businesses (id, name, owner_user_id, status) values (%L, ''x'', %L, ''ACTIVE'')',
    'b_listingtest_' || substr(md5(random()::text), 1, 8), v_owner)),
    'owner cannot create a business that is already ACTIVE');
  execute 'reset role';

  update public.businesses set status = 'ACTIVE' where id = v_biz;           -- as postgres (= admin / service): allowed
  perform pg_temp.chk((select status::text from public.businesses where id = v_biz) = 'ACTIVE', 'a non-client role can still approve');

  -- ── providers ───────────────────────────────────────────────
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  insert into public.providers (id, user_id, display_name, status) values (v_prov, v_cust, 'Listing test', 'ACTIVE');
  perform pg_temp.chk((select status::text from public.providers where id = v_prov) = 'ACTIVE', 'a new provider still goes live at once');
  execute 'reset role';

  update public.providers set status = 'SUSPENDED' where id = v_prov;
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  perform pg_temp.chk(pg_temp.refused(format('update public.providers set status = ''ACTIVE'' where id = %L', v_prov)),
    'a provider cannot lift their own suspension');
  update public.providers set display_name = 'Listing test 2' where id = v_prov;
  perform pg_temp.chk((select display_name from public.providers where id = v_prov) = 'Listing test 2', 'a suspended provider can still edit their profile text');
  execute 'reset role';

  -- ── categories ──────────────────────────────────────────────
  execute 'set local role authenticated';
  perform pg_temp.as_user(v_cust);
  perform pg_temp.chk(pg_temp.refused(format(
    'insert into public.categories (id, name, slug, kind, status) values (%L, ''x'', %L, ''BOTH'', ''ACTIVE'')', v_cat, v_cat)),
    'a user cannot create an ACTIVE category');
  insert into public.categories (id, name, slug, kind) values (v_cat, 'Listing test', v_cat, 'BOTH');
  perform pg_temp.chk((select status::text from public.categories where id = v_cat) = 'PENDING', 'a proposed category lands as PENDING');
  execute 'reset role';

  raise exception 'ALL_LISTING_STATUS_CHECKS_PASSED';
end $test$;
