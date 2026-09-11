-- Rollback for 20260957_queue_waiting_line.sql
--
-- 20260957 only ADDS objects (a function, a trigger function, a trigger and a
-- nullable column), so rolling back is removing them. Nothing it touched
-- existed before — see supabase/snapshots/2026-09-11_pre_reconcile.sql.
--
-- ⚠ Only run this while NO shipped app version calls queue_waiting_line()
-- (i.e. before the Stage 2 app update goes out). After that, removing it
-- breaks the queue display on the business page and in My Queues.

drop trigger if exists trg_queue_line_changed on public.queue_tokens;
drop function if exists public.bump_queue_line_changed();
drop function if exists public.queue_waiting_line(text[]);
alter table public.queue_settings drop column if exists line_changed_at;

notify pgrst, 'reload schema';
