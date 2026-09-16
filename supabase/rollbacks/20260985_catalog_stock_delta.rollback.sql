-- Rollback for 20260985_catalog_stock_delta.sql
-- public.catalog_item_adjust_quantity did not exist in production before the apply (pg_proc, 2026-09-16), so dropping
-- it restores the previous state exactly.
-- WARNING: restoring returns stock changes to a read-modify-write from the console, where two people restocking the
-- same item overwrite each other (INV-4). Roll the app back too, or restocking will fail with "function not found".

drop function if exists public.catalog_item_adjust_quantity(text, integer);
