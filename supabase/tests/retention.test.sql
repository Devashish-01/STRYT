-- Behaviour test for 20261020_retention.sql (GAPS #54). Run AFTER the migration is applied.
-- Runs entirely inside one transaction that ends in an error, so nothing is saved.
-- Passing looks like:  ERROR: ALL_RETENTION_CHECKS_PASSED
-- Uses the test customer +91 9222222222 and the test shop; their rows are only changed inside the rolled-back transaction.
create or replace function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $f$
begin
  if p_ok is not true then raise exception 'CHECK FAILED: %', p_msg; end if;
end $f$;

do $test$
declare
  v_biz constant text := 'b_deliverytest00000000000000000001';
  v_user text;
  v_phone text;
  v_old  constant timestamptz := now() - interval '13 months';
  v_old2 constant timestamptz := now() - interval '25 months';
  v_old3 constant timestamptz := now() - interval '37 months';
  v_out jsonb;
begin
  select id::text into v_user from auth.users where phone = '919222222222';
  perform pg_temp.chk(v_user is not null, 'the test customer exists');
  select phone into v_phone from public.users where id = v_user;

  -- the API roles can't reach any of it
  perform pg_temp.chk(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no access to schema private');
  perform pg_temp.chk(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated has no access to schema private');
  perform pg_temp.chk(not has_function_privilege('authenticated', 'public.purge_old_rows()', 'execute'), 'users cannot run the clean-up');

  -- one old and one recent row in every table the clean-up touches
  -- events.name is constrained to product event names in production; identify
  -- these test rows by props instead of inventing event names.
  insert into public.events (name, props, created_at, user_id)
    values ('otp_sent', '{"retention_test":"old"}'::jsonb, v_old, null),
           ('otp_verified', '{"retention_test":"new"}'::jsonb, now(), null);
  insert into public.client_errors (kind, message, created_at) values ('test', 'retention_test_old', v_old), ('test', 'retention_test_new', now());
  insert into public.business_view_logs (business_id, viewed_at) values (v_biz, v_old), (v_biz, now() - interval '1 minute');
  insert into public.notifications (user_id, type, title, body, created_at)
    values (v_user, 'SYSTEM', 'retention_test_old', 'x', v_old), (v_user, 'SYSTEM', 'retention_test_new', 'x', now());
  insert into public.support_tickets (user_id, category, email, subject, message, created_at)
    values (v_user, 'OTHER', 'test@example.com', 'retention_test_old', 'x', v_old2),
           (v_user, 'OTHER', 'test@example.com', 'retention_test_new', 'x', v_old);
  insert into public.bug_reports (user_id, description, reporter_role, created_at)
    values (v_user, 'retention_test_old', 'CUSTOMER', v_old2), (v_user, 'retention_test_new', 'CUSTOMER', v_old);
  insert into public.admin_actions (admin_user_id, action, target_type, target_id, created_at)
    values (v_user, 'retention_test_old', 'test', 'x', v_old3), (v_user, 'retention_test_new', 'test', 'x', v_old2);

  -- deleting an account keeps its registration details in private storage
  update public.users set name = 'Deleted User', phone = '0000000000', email = null, customer_enabled = false,
                          customer_deleted_at = now()
   where id = v_user;
  perform pg_temp.chk(exists (select 1 from private.deleted_account_registrations
                               where user_id = v_user and phone is not distinct from nullif(v_phone, '0000000000')
                                 and name <> 'Deleted User'
                                 and delete_after between now() + interval '179 days' and now() + interval '181 days'),
                      'the deleted account''s registration details are kept for 180 days');

  -- a later update doesn't overwrite them
  update public.users set customer_deleted_at = now() where id = v_user;
  perform pg_temp.chk((select name from private.deleted_account_registrations where user_id = v_user) <> 'Deleted User',
                      'a second update keeps the original details');

  -- before 180 days the copy survives the clean-up; after, it goes
  v_out := public.purge_old_rows();
  perform pg_temp.chk(exists (select 1 from private.deleted_account_registrations where user_id = v_user), 'kept inside 180 days');
  update private.deleted_account_registrations set delete_after = now() - interval '1 second' where user_id = v_user;
  v_out := public.purge_old_rows();
  perform pg_temp.chk(not exists (select 1 from private.deleted_account_registrations where user_id = v_user), 'deleted after 180 days');

  -- old rows are gone, recent ones stay
  perform pg_temp.chk(not exists (select 1 from public.events where props->>'retention_test' = 'old'), 'old event deleted');
  perform pg_temp.chk(exists (select 1 from public.events where props->>'retention_test' = 'new'), 'recent event kept');
  perform pg_temp.chk(not exists (select 1 from public.client_errors where message = 'retention_test_old'), 'old error deleted');
  perform pg_temp.chk(exists (select 1 from public.client_errors where message = 'retention_test_new'), 'recent error kept');
  perform pg_temp.chk(not exists (select 1 from public.business_view_logs where business_id = v_biz and viewed_at = v_old), 'old view deleted');
  perform pg_temp.chk(exists (select 1 from public.business_view_logs where business_id = v_biz and viewed_at > now() - interval '1 day'), 'recent view kept');
  perform pg_temp.chk(not exists (select 1 from public.notifications where title = 'retention_test_old'), 'old notification deleted');
  perform pg_temp.chk(exists (select 1 from public.notifications where title = 'retention_test_new'), 'recent notification kept');
  perform pg_temp.chk(not exists (select 1 from public.support_tickets where subject = 'retention_test_old'), '25-month ticket deleted');
  perform pg_temp.chk(exists (select 1 from public.support_tickets where subject = 'retention_test_new'), '13-month ticket kept');
  perform pg_temp.chk(not exists (select 1 from public.bug_reports where description = 'retention_test_old'), '25-month bug report deleted');
  perform pg_temp.chk(exists (select 1 from public.bug_reports where description = 'retention_test_new'), '13-month bug report kept');
  perform pg_temp.chk(not exists (select 1 from public.admin_actions where action = 'retention_test_old'), '37-month audit row deleted');
  perform pg_temp.chk(exists (select 1 from public.admin_actions where action = 'retention_test_new'), '25-month audit row kept');

  raise exception 'ALL_RETENTION_CHECKS_PASSED';
end $test$;
