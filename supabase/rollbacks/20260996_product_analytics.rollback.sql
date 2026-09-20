-- Rollback for 20260996_product_analytics
--
-- Removes the analytics sink and the health aggregate. Both are additive — nothing else in the schema
-- reads them — so this is a clean removal rather than a restore.
--
-- ⚠ Dropping public.events destroys every event collected so far, and events are not reconstructible:
-- a guest journey that happened yesterday cannot be recovered from any other table. That is the whole
-- reason the table exists. Export first if the data has any value:
--     copy (select * from public.events) to stdout with csv header;
--
-- Roll the client back too, or track() will keep posting to a table that no longer exists. It swallows
-- the failure by design, so nothing user-facing breaks — the events are simply lost silently, which is
-- worse than a visible error if nobody notices.

begin;

drop function if exists public.marketplace_health(integer);
drop table if exists public.events;

notify pgrst, 'reload schema';

commit;
