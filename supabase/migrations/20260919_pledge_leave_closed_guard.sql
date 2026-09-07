-- ============================================================
-- 20260919 — Fix gap log #15: bulk_deal_pledge_leave had no closed-campaign
-- guard, while its counterpart bulk_deal_pledge_join has always raised
-- DEAL_CLOSED. Leaving an already-closed campaign silently succeeded, with
-- three consequences:
--
--   1. It recomputed bulk_deals.pledged_quantity downward on a CLOSED
--      campaign — corrupting the historical record BulkDealDetail reads back
--      for the business after the fact.
--   2. It orphaned an already-minted claim pass. bulk_deal_tokens FKs to
--      bulk_deals(id) and users(id), never to bulk_deal_pledges — so on a
--      FULFILLED campaign the pledge row vanished while the customer kept a
--      valid, still-redeemable pass.
--   3. It hard-deleted PAID deposit rows, leaving the business no record at
--      all of who had paid what.
--
-- Deliberately NOT changed here: leaving an OPEN campaign still hard-deletes
-- the pledge, including a PAID one. Preserving that payment record properly
-- needs a soft-delete status ('LEFT'), which means widening the
-- deposit_status check constraint and auditing every query that reads it —
-- a real design change, not a guard. Tracked separately in gap log #15's own
-- "fix direction" rather than smuggled in here.
-- ============================================================

create or replace function public.bulk_deal_pledge_leave(p_deal_id text)
returns public.bulk_deals
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;

  delete from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid;

  update public.bulk_deals
     set pledged_quantity = (select coalesce(sum(quantity), 0) from public.bulk_deal_pledges where deal_id = p_deal_id)
   where id = p_deal_id
  returning * into v_deal;

  return v_deal;
end
$$;

revoke execute on function public.bulk_deal_pledge_leave(text) from public, anon;
grant execute on function public.bulk_deal_pledge_leave(text) to authenticated;
