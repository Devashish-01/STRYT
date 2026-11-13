-- Rollback for 20261011_listing_status_guard.sql — nothing existed before it, so this only removes it.
drop trigger if exists trg_guard_listing_status on public.businesses;
drop trigger if exists trg_guard_listing_status on public.providers;
drop trigger if exists trg_guard_listing_status on public.categories;
drop function if exists public.guard_listing_status();
