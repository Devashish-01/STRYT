-- Rollback for 20260986_search_nearby_and_category_counts.sql
-- None of these three functions existed in production before the apply (pg_proc, 2026-09-16), so dropping them
-- restores the previous state exactly.
-- WARNING: restoring returns search to an unbounded, unordered name/category match that can't find a shop by what it
-- sells (S1, S2), and category counts to downloading every active listing to the client (C2). Roll the app back too,
-- or search and the category directory will fail with "function not found".

drop function if exists public.search_businesses_nearby(text, double precision, double precision, double precision, integer, integer);
drop function if exists public.search_providers_nearby(text, double precision, double precision, double precision, integer, integer);
drop function if exists public.category_counts_nearby(double precision, double precision, double precision);
