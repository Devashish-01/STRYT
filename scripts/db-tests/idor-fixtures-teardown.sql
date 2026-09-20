-- Teardown for idor-fixtures.sql — STAGING ONLY.
--
-- Every fixture row is tagged 'idor-fixture' in a text column, except the few tables that have no free
-- text field (terms_acceptances, emergency_contacts, profile_deletion_requests, leaderboard_points,
-- user_blocks), where the fixture is identified by the two customer persona ids instead. Those tables
-- hold no other persona rows in a seeded staging database — if that ever changes, narrow these deletes.
--
-- Verify after running: the SELECT at the bottom must report 0 leftovers and 7 personas.

begin;

delete from public.notifications              where title       like 'idor-fixture%';
delete from public.fcm_tokens                 where token       like 'idor-fixture%';
delete from public.push_subscriptions         where endpoint    like '%idor-fixture%';
delete from public.support_tickets            where subject     like 'idor-fixture%';
delete from public.bug_reports                where description like 'idor-fixture%';
delete from public.client_errors              where kind        like 'idor-fixture%';
delete from public.bookmarks                  where target_id   like 'idor-fixture%';
delete from public.saved_searches             where query       like 'idor-fixture%';
delete from public.user_lists                 where name        like 'idor-fixture%';
delete from public.requests                   where title       like 'idor-fixture%';

delete from public.terms_acceptances
  where user_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')
    and login_attempt_id is null;
delete from public.emergency_contacts
  where owner_user_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
delete from public.profile_deletion_requests
  where user_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
delete from public.leaderboard_points
  where user_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
delete from public.user_blocks
  where blocked_user_id = '00000000-0000-4000-8000-000000000006';

commit;

select 'leftover_fixtures' as k,
  ((select count(*) from public.notifications   where title   like 'idor-fixture%')
  +(select count(*) from public.requests        where title   like 'idor-fixture%')
  +(select count(*) from public.support_tickets where subject like 'idor-fixture%')
  +(select count(*) from public.fcm_tokens      where token   like 'idor-fixture%'))::text as v
union all
select 'personas_intact', count(*)::text from public.users
  where id like '00000000-0000-4000-8000-00000000000%';
