-- Migration: 20260962_pin_function_search_paths.sql
-- Description: Pins search_path on functions to eliminate mutable search_path vulnerability (F1 & F4)
-- Closes Security Advisor finding function_search_path_mutable on enforce_queue_open_on_join and notify_on_queue_called

ALTER FUNCTION public.enforce_queue_open_on_join() SET search_path = public;
ALTER FUNCTION public.notify_on_queue_called() SET search_path = public;
ALTER FUNCTION public.rls_auto_enable() SET search_path = pg_catalog;
