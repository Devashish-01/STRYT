-- ============================================================
-- Catalogue inventory modes. Run manually in Supabase SQL editor.
--
-- Each catalog item is now one of two inventory modes:
--   • INFINITE (default) — services like a haircut/consultation: always
--     available unless the owner manually marks it unavailable.
--   • FINITE — a countable stock (e.g. "Burger × 25"): every appointment that
--     reserves it decrements the count by one; at zero it auto-marks
--     unavailable. The owner can restock any time by raising the quantity.
--
-- catalog_items was created in Studio (schema drift), so columns are added
-- defensively and the reserve function casts the id to text to work whether
-- the PK is text or uuid.
-- ============================================================

alter table public.catalog_items
  add column if not exists inventory_type text not null default 'INFINITE',
  add column if not exists quantity int;

alter table public.catalog_items drop constraint if exists catalog_items_inventory_type_check;
alter table public.catalog_items add constraint catalog_items_inventory_type_check
  check (inventory_type in ('INFINITE', 'FINITE'));

-- Atomically reserve one unit of a FINITE item when it's booked. No-ops for
-- INFINITE items, unknown ids (e.g. provider packages / cart bundles), or an
-- already-sold-out item — so it's always safe to call after any booking.
-- SECURITY DEFINER: a customer must be able to decrement the shop's stock.
create or replace function public.reserve_catalog_item(p_item_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.catalog_items
     set quantity = greatest(coalesce(quantity, 0) - 1, 0),
         stock_status = case when coalesce(quantity, 0) - 1 <= 0 then 'OUT_OF_STOCK' else stock_status end
   where id::text = p_item_id
     and inventory_type = 'FINITE'
     and coalesce(quantity, 0) > 0;
$$;

grant execute on function public.reserve_catalog_item(text) to authenticated;
