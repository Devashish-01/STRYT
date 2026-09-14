-- Rollback: 20260962_pin_function_search_paths.rollback.sql
-- Restores prior search_path configuration for affected functions

ALTER FUNCTION public.enforce_queue_open_on_join() RESET search_path;
ALTER FUNCTION public.notify_on_queue_called() RESET search_path;
ALTER FUNCTION public.rls_auto_enable() SET search_path = pg_catalog;
