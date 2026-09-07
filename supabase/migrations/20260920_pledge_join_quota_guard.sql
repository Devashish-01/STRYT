-- ============================================================
-- 20260920 — Fix gap log #16: available_quota stopped being enforced
-- server-side when the campaign model replaced the instant-order model.
--
-- The retired bulk_deal_order (20260827_bulk_checkout.sql) enforced it
-- properly — a hard check at :169 plus a decrement under a row lock at
-- :221-223 — with that file's own header stating the intent: "decrements
-- available_quota under a row lock so a deal can't oversell."
-- bulk_deal_pledge_join (20260900) dropped both, leaving the only
-- enforcement in the client's quantity stepper. A direct API call or a stale
-- client oversold freely.
--
-- Two things the campaign model changes about how this check has to work:
--
--   1. Nothing decrements available_quota any more — pledged_quantity is the
--      running total instead. So the check compares the POOL against the cap,
--      not one order against it. That matches how the card already renders it
--      ("N left"), i.e. quota is a pool cap, never a per-pledger maximum.
--   2. pledge_join is an UPSERT — re-pledging changes an existing row. So the
--      pledger's own current quantity must come out of the pool total before
--      comparing, otherwise someone LOWERING their pledge on a full campaign
--      would be wrongly rejected (their own units would be counted twice).
--
-- The existing `select ... for update` on bulk_deals already serialises
-- concurrent pledgers, so two people racing for the last units can't both
-- pass the check — same protection the original had.
-- ============================================================

create or replace function public.bulk_deal_pledge_join(
  p_deal_id text, p_quantity integer default 1, p_notes text default null,
  p_delivery_address text default null
) returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_mine integer;
  v_others integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.status <> 'ACTIVE' then raise exception 'DEAL_NOT_ACTIVE'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;
  if v_deal.owner_user_id = v_uid then raise exception 'OWNER_CANNOT_PLEDGE'; end if;

  if v_deal.fulfillment_type = 'DOORSTEP'
     and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  if v_deal.available_quota is not null then
    select quantity into v_mine
      from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid;
    v_others := greatest(coalesce(v_deal.pledged_quantity, 0) - coalesce(v_mine, 0), 0);
    if v_others + p_quantity > v_deal.available_quota then
      raise exception 'INSUFFICIENT_QUOTA';
    end if;
  end if;

  insert into public.bulk_deal_pledges (deal_id, user_id, quantity, notes, delivery_address)
  values (p_deal_id, v_uid, p_quantity,
          nullif(left(trim(coalesce(p_notes,'')), 300), ''),
          nullif(left(trim(coalesce(p_delivery_address,'')), 400), ''))
  on conflict (deal_id, user_id) do update
    set quantity = excluded.quantity,
        notes = excluded.notes,
        delivery_address = excluded.delivery_address;

  update public.bulk_deals
     set pledged_quantity = (select coalesce(sum(quantity), 0) from public.bulk_deal_pledges where deal_id = p_deal_id)
   where id = p_deal_id
  returning * into v_deal;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_deal.owner_user_id, 'BULK_DEAL_PLEDGE', 'New pledge',
      'Someone pledged ' || p_quantity::text || (case when p_quantity = 1 then ' unit' else ' units' end)
        || ' to "' || left(v_deal.title, 60) || '".',
      '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id);
  exception when others then null;
  end;

  return v_deal;
end
$$;

revoke execute on function public.bulk_deal_pledge_join(text, integer, text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_join(text, integer, text, text) to authenticated;
