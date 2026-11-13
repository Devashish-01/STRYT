-- Behaviour test for 20261019_shop_login_sessions.sql (GAPS #53). Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_SHOP_LOGIN_CHECKS_PASSED
-- Uses the test shop (owner +91 9111111111). +91 9222222222 signs in with the shop password; +91 9333333333 is a named
-- team member. Their existing sessions at the test shop are removed for the length of the test (rolled back).
create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
end $f$;

create or replace function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $f$
begin
  if p_ok is not true then raise exception 'CHECK FAILED: %', p_msg; end if;
end $f$;

-- Runs p_sql as p_uid (role authenticated) and returns the error text, or null when it succeeded.
create or replace function pg_temp.err_as(p_uid text, p_sql text) returns text language plpgsql as $f$
declare v_e text;
begin
  execute 'set local role authenticated';
  perform pg_temp.as_user(p_uid);
  begin
    execute p_sql;
  exception when others then
    v_e := sqlerrm;
  end;
  execute 'reset role';
  return v_e;
end $f$;

-- Signs p_uid in with the shop login; returns the status the function answered.
create or replace function pg_temp.login_as(p_uid text, p_login text, p_password text) returns text language plpgsql as $f$
declare v_status text;
begin
  execute 'set local role authenticated';
  perform pg_temp.as_user(p_uid);
  select status into v_status from public.business_login_attempt(p_login, p_password);
  execute 'reset role';
  return v_status;
end $f$;

do $test$
declare
  v_biz constant text := 'b_deliverytest00000000000000000001';
  v_owner text; v_staff text; v_member text;
  v_save text;
  v_e text;
  v_status text;
begin
  select id::text into v_owner  from auth.users where phone = '919111111111';
  select id::text into v_staff  from auth.users where phone = '919222222222';
  select id::text into v_member from auth.users where phone = '919333333333';
  perform pg_temp.chk(v_owner is not null and v_staff is not null and v_member is not null, 'the test accounts exist');
  perform pg_temp.chk((select owner_user_id from public.businesses where id = v_biz) = v_owner, 'the test shop belongs to 9111111111');

  perform pg_temp.chk((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'set_business_login') = 1,
                      'only one set_business_login is left');

  delete from public.business_access_sessions where business_id = v_biz and grantee_user_id in (v_staff, v_member);
  delete from public.business_login_credentials where business_id = v_biz;

  -- the login id is checked
  v_save := 'select public.set_business_login(%L, %L, ''TestOnly-123'', false, 8, true, ''SCOPED'', array[''queue''])';
  v_e := pg_temp.err_as(v_owner, format(v_save, v_biz, 'ab'));
  perform pg_temp.chk(v_e like 'Use 4-40%', 'a 2-letter login id is refused: ' || coalesce(v_e, 'no error'));
  v_e := pg_temp.err_as(v_owner, format(v_save, v_biz, 'has space'));
  perform pg_temp.chk(v_e like 'Use 4-40%', 'a login id with a space is refused: ' || coalesce(v_e, 'no error'));
  v_e := pg_temp.err_as(v_owner, format(v_save, v_biz, '12345'));
  perform pg_temp.chk(v_e like 'A numeric login id%', 'a short number is refused: ' || coalesce(v_e, 'no error'));
  v_e := pg_temp.err_as(v_owner, format(v_save, v_biz, '9000000001'));
  perform pg_temp.chk(v_e like 'A number can only be%', 'someone else''s number is refused: ' || coalesce(v_e, 'no error'));
  v_e := pg_temp.err_as(v_owner, format(v_save, v_biz, '  Counter-Test.1  '));
  perform pg_temp.chk(v_e is null, 'a good login id saves: ' || coalesce(v_e, ''));
  perform pg_temp.chk((select login_id from public.business_login_credentials where business_id = v_biz) = 'counter-test.1',
                      'the login id is stored trimmed and lower-case');

  -- a shop-password sign-in is tagged SHARED_LOGIN; a named grant is GRANT (the column default)
  v_status := pg_temp.login_as(v_staff, 'COUNTER-TEST.1', 'TestOnly-123');
  perform pg_temp.chk(v_status = 'ACTIVE', 'the staff member signs in with the shop password: ' || coalesce(v_status, 'null'));
  perform pg_temp.chk((select source from public.business_access_sessions
                        where business_id = v_biz and grantee_user_id = v_staff and status = 'ACTIVE') = 'SHARED_LOGIN',
                      'a shop-password session is SHARED_LOGIN');
  insert into public.business_access_sessions (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
  values (v_biz, v_member, 'ACTIVE', now(), null, 'SCOPED', array['catalog']);
  perform pg_temp.chk((select source from public.business_access_sessions
                        where business_id = v_biz and grantee_user_id = v_member and status = 'ACTIVE') = 'GRANT',
                      'a named grant is GRANT');

  -- turning the shop login off signs out the shop-password session, tells them why, and leaves the named grant alone
  v_e := pg_temp.err_as(v_owner, format(
    'select public.set_business_login(%L, ''counter-test.1'', '''', false, 8, false, ''SCOPED'', array[''queue''])', v_biz));
  perform pg_temp.chk(v_e is null, 'the owner can turn the login off: ' || coalesce(v_e, ''));
  perform pg_temp.chk(not exists (select 1 from public.business_access_sessions
                                   where business_id = v_biz and grantee_user_id = v_staff and status in ('PENDING', 'ACTIVE')),
                      'the shop-password session is ended');
  perform pg_temp.chk((select status from public.business_access_sessions
                        where business_id = v_biz and grantee_user_id = v_staff order by requested_at desc limit 1) = 'REVOKED',
                      'it is REVOKED');
  perform pg_temp.chk(exists (select 1 from public.notifications where user_id = v_staff and title = 'Shop login turned off'),
                      'the staff member is told why');
  perform pg_temp.chk(exists (select 1 from public.business_access_sessions
                               where business_id = v_biz and grantee_user_id = v_member and status = 'ACTIVE'),
                      'the named team member keeps their access');

  -- with the login off, the password no longer gets anyone in; the empty password didn't wipe the saved one
  v_status := pg_temp.login_as(v_staff, 'counter-test.1', 'TestOnly-123');
  perform pg_temp.chk(v_status = 'INVALID_CREDENTIALS', 'a turned-off login lets nobody in: ' || coalesce(v_status, 'null'));
  perform pg_temp.chk((select password_hash from public.business_login_credentials where business_id = v_biz) <> '',
                      'saving with an empty password keeps the old one');

  -- a staff member can't change the shop login
  v_e := pg_temp.err_as(v_staff, format(v_save, v_biz, 'taken-over'));
  perform pg_temp.chk(v_e like 'Only the business owner%', 'staff cannot save the shop login: ' || coalesce(v_e, 'no error'));

  raise exception 'ALL_SHOP_LOGIN_CHECKS_PASSED';
end $test$;
