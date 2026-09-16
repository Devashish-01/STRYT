-- 20260985_catalog_stock_delta
--
-- INVENTORY_ALERTS INV-4: restocking wrote an absolute quantity the console had read a moment earlier, so two people
-- working the same shop (a counter and a back room, or one person on two devices) overwrote each other: three sold
-- and five received could land as "five", losing the sale. This applies the change as a delta inside the database,
-- under the row lock, and keeps stock_status consistent with the result.
--
-- Read-modify-write on the client can't be made safe by retrying: both readers see the same starting number.
--
-- Rollback: supabase/rollbacks/20260985_catalog_stock_delta.rollback.sql

create or replace function public.catalog_item_adjust_quantity(p_id text, p_delta integer)
 returns public.catalog_items
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_item public.catalog_items%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_item from public.catalog_items where id = p_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if not public.has_business_scope(v_item.business_id, v_uid, 'catalog') then raise exception 'NOT_CATALOG_MANAGER'; end if;
  if coalesce(v_item.inventory_type, 'INFINITE') <> 'FINITE' then raise exception 'NOT_A_COUNTED_ITEM'; end if;

  update public.catalog_items
     set quantity = greatest(0, coalesce(quantity, 0) + p_delta),
         stock_status = (case when greatest(0, coalesce(quantity, 0) + p_delta) = 0 then 'OUT_OF_STOCK' else 'IN_STOCK' end)::public.stock_status
   where id = p_id
  returning * into v_item;

  return v_item;
end $function$;

revoke all on function public.catalog_item_adjust_quantity(text, integer) from public, anon;
grant execute on function public.catalog_item_adjust_quantity(text, integer) to authenticated;
