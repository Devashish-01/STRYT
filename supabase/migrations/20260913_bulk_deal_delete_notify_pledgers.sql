-- ============================================================
-- 20260913 — bulk_deal_delete: replace the bare client .delete() with an RPC
-- that notifies pledgers whose deposit was PAID before the FK cascade wipes
-- their pledge row (flow-completeness audit, workflow 16). The client-side
-- confirmation-dialog guard is a separate, UI-only change in
-- BulkDealsManager.tsx — this migration only covers the notification, since
-- there was never a server-side hook to add one to before.
-- ============================================================

create or replace function public.bulk_deal_delete(p_deal_id text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_ALLOWED';
  end if;

  for v_pledger in
    select user_id from public.bulk_deal_pledges
    where deal_id = p_deal_id and deposit_status = 'PAID'
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_pledger, 'BULK_DEAL_DEPOSIT_REJECTED', 'Campaign cancelled',
        'The business removed "' || left(v_deal.title, 60) || '" — your paid deposit needs to be sorted out with them directly.',
        '/business/' || v_deal.business_id);
    exception when others then null;
    end;
  end loop;

  -- FK cascade removes bulk_deal_pledges/bulk_deal_tokens for this deal.
  delete from public.bulk_deals where id = p_deal_id;
end
$$;

revoke execute on function public.bulk_deal_delete(text) from public, anon;
grant execute on function public.bulk_deal_delete(text) to authenticated;
