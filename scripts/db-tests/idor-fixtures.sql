-- IDOR sweep fixtures — STAGING ONLY. Never run this against production.
--
-- Why: the first sweep run covered 93 tables but could only test cross-user reads on 2 of the 49 tables
-- that have an owner column — the other 47 were empty, so "no rows leaked" meant "no rows existed".
-- An empty table passes every access test ever written. seed-staging.mjs only fills the 8 tables the
-- catalogue needs (businesses, providers, categories, catalog_items, …), which is why the private ones
-- were blind.
--
-- This gives each privacy-sensitive table one row owned by customer1 and one owned by customer2, so the
-- sweep's cross-user probe ("can customer1 read customer2's row?") has something real to find.
-- Everything is tagged 'idor-fixture' so it is trivially identifiable and removable.
--
-- Usage: apply to staging, run the sweep, then run idor-fixtures-teardown.sql.

begin;

-- customer1 = …0001, customer2 = …0002

insert into public.notifications (user_id, type, title, body) values
  ('00000000-0000-4000-8000-000000000001','SYSTEM','idor-fixture c1','private to customer1'),
  ('00000000-0000-4000-8000-000000000002','SYSTEM','idor-fixture c2','private to customer2');

insert into public.fcm_tokens (user_id, token, platform) values
  ('00000000-0000-4000-8000-000000000001','idor-fixture-token-c1','android'),
  ('00000000-0000-4000-8000-000000000002','idor-fixture-token-c2','android');

insert into public.terms_acceptances (user_id, version) values
  ('00000000-0000-4000-8000-000000000001','2026-08-26'),
  ('00000000-0000-4000-8000-000000000002','2026-08-26');

insert into public.emergency_contacts (owner_user_id, contact_user_id) values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-4000-8000-000000000001','https://example.invalid/idor-fixture-c1','k1','a1'),
  ('00000000-0000-4000-8000-000000000002','https://example.invalid/idor-fixture-c2','k2','a2');

insert into public.support_tickets (user_id, category, email, subject, message) values
  ('00000000-0000-4000-8000-000000000001','other','c1@example.invalid','idor-fixture c1','private message c1'),
  ('00000000-0000-4000-8000-000000000002','other','c2@example.invalid','idor-fixture c2','private message c2');

insert into public.bug_reports (user_id, description) values
  ('00000000-0000-4000-8000-000000000001','idor-fixture c1'),
  ('00000000-0000-4000-8000-000000000002','idor-fixture c2');

insert into public.client_errors (user_id, kind) values
  ('00000000-0000-4000-8000-000000000001','idor-fixture-c1'),
  ('00000000-0000-4000-8000-000000000002','idor-fixture-c2');

insert into public.profile_deletion_requests (user_id, target_type) values
  ('00000000-0000-4000-8000-000000000001','customer'),
  ('00000000-0000-4000-8000-000000000002','customer');

insert into public.bookmarks (user_id, target_type, target_id) values
  ('00000000-0000-4000-8000-000000000001','business','idor-fixture-c1'),
  ('00000000-0000-4000-8000-000000000002','business','idor-fixture-c2');

insert into public.user_blocks (blocker_user_id, blocked_user_id) values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000006'),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006');

insert into public.saved_searches (user_id, query) values
  ('00000000-0000-4000-8000-000000000001','idor-fixture c1'),
  ('00000000-0000-4000-8000-000000000002','idor-fixture c2');

insert into public.user_lists (user_id, name) values
  ('00000000-0000-4000-8000-000000000001','idor-fixture c1'),
  ('00000000-0000-4000-8000-000000000002','idor-fixture c2');

insert into public.leaderboard_points (user_id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002')
on conflict do nothing;

insert into public.requests (requester_user_id, title) values
  ('00000000-0000-4000-8000-000000000001','idor-fixture c1'),
  ('00000000-0000-4000-8000-000000000002','idor-fixture c2');

commit;
