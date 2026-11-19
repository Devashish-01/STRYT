-- Rollback for 20261021_delivery_live_tracking_enabled.sql
-- Restores previous function definitions or drops the new tracking overload.

drop function if exists public.my_delivery_progress(text);
drop function if exists public.get_tracking(text);

notify pgrst, 'reload schema';
