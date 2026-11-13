-- Behaviour test for 20261018_money_scope.sql (GAPS #51). Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_MONEY_SCOPE_CHECKS_PASSED
-- Uses the test shop (owner +91 9111111111) and gives +91 9222222222 a team grant for the length of the test.
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

do $test$
declare
  v_biz constant text := 'b_deliverytest00000000000000000001';
  v_owner text; v_staff text; v_session uuid;
  v_calls text[];
  v_call text;
  v_e text;
begin
  select id::text into v_owner from auth.users where phone = '919111111111';
  select id::text into v_staff from auth.users where phone = '919222222222';
  perform pg_temp.chk(v_owner is not null and v_staff is not null, 'the test accounts exist');
  perform pg_temp.chk((select owner_user_id from public.businesses where id = v_biz) = v_owner, 'the test shop belongs to 9111111111');

  -- the backfill: no grant or saved login with `appointments` is left without `money`
  perform pg_temp.chk(not exists (select 1 from public.business_access_sessions
                                   where 'appointments' = any(scopes) and not ('money' = any(scopes))),
                      'every grant with appointments also has money');
  perform pg_temp.chk(not exists (select 1 from public.business_login_credentials
                                   where 'appointments' = any(scopes) and not ('money' = any(scopes))),
                      'every saved login with appointments also has money');

  -- start clean: whatever 9222222222 already had at this shop is emptied (rolled back at the end)
  update public.business_access_sessions set scopes = '{}', access_level = 'SCOPED'
   where business_id = v_biz and grantee_user_id = v_staff;
  insert into public.business_access_sessions (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
  values (v_biz, v_staff, 'ACTIVE', now(), null, 'SCOPED', array['appointments', 'queue'])
  returning id into v_session;

  v_calls := array[
    format('select * from public.business_cash_to_settle(%L)', v_biz),
    format('select * from public.business_cash_outstanding(%L)', v_biz),
    format('select public.business_delivery_stats(%L, 30)', v_biz),
    format('select public.settle_agent_cash(%L, %L)', v_biz, v_owner)
  ];

  -- Orders without money: every money function refuses
  foreach v_call in array v_calls loop
    v_e := pg_temp.err_as(v_staff, v_call);
    perform pg_temp.chk(v_e like '%NOT_ALLOWED%', 'appointments without money is refused: ' || v_call || ' -> ' || coalesce(v_e, 'no error'));
  end loop;

  -- per-order work stays on appointments, which the grant still has
  perform pg_temp.chk(public.has_business_scope(v_biz, v_staff, 'appointments'), 'the grant still has appointments');

  -- the owner ticks money: the whitelist keeps it, drops junk
  v_e := pg_temp.err_as(v_owner, format('select public.update_team_member_scopes(%L::uuid, array[''appointments'',''queue'',''money'',''bogus''])', v_session));
  perform pg_temp.chk(v_e is null, 'owner can update scopes: ' || coalesce(v_e, ''));
  perform pg_temp.chk((select scopes from public.business_access_sessions where id = v_session) @> array['money']
                      and not ((select scopes from public.business_access_sessions where id = v_session) @> array['bogus']),
                      'update_team_member_scopes keeps money and drops unknown scopes');

  -- with money: every money function answers
  foreach v_call in array v_calls loop
    v_e := pg_temp.err_as(v_staff, v_call);
    perform pg_temp.chk(v_e is null, 'money holder is allowed: ' || v_call || ' -> ' || coalesce(v_e, ''));
  end loop;

  -- the owner is always allowed
  foreach v_call in array v_calls loop
    v_e := pg_temp.err_as(v_owner, v_call);
    perform pg_temp.chk(v_e is null, 'owner is allowed: ' || v_call || ' -> ' || coalesce(v_e, ''));
  end loop;

  -- money alone, no longer anything else: still allowed (the permission is about money, not orders)
  update public.business_access_sessions set scopes = array['money'] where id = v_session;
  v_e := pg_temp.err_as(v_staff, v_calls[1]);
  perform pg_temp.chk(v_e is null, 'money alone reads rider cash: ' || coalesce(v_e, ''));

  -- a staff member can't give themselves money
  update public.business_access_sessions set scopes = array['appointments'] where id = v_session;
  v_e := pg_temp.err_as(v_staff, format('select public.update_team_member_scopes(%L::uuid, array[''appointments'',''money''])', v_session));
  perform pg_temp.chk(v_e like '%NOT_ALLOWED%', 'staff cannot widen their own scopes: ' || coalesce(v_e, 'no error'));

  -- the shared login keeps money too
  v_e := pg_temp.err_as(v_owner, format(
    'select public.set_business_login(%L, ''money-test-login'', ''TestOnly-123'', false, 8, false, ''SCOPED'', array[''queue'',''money''])', v_biz));
  perform pg_temp.chk(v_e is null, 'owner can save the shop login: ' || coalesce(v_e, ''));
  perform pg_temp.chk((select scopes from public.business_login_credentials where business_id = v_biz) @> array['money'],
                      'set_business_login keeps money');

  raise exception 'ALL_MONEY_SCOPE_CHECKS_PASSED';
end $test$;
