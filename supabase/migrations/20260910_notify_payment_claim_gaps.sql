-- ============================================================
-- 20260910 — Fix payment-claim notification gaps (flow-completeness audit,
-- workflows 08 and 16):
--
--   1. agreement_claim_payment/confirm_payment/reject_payment — none of the
--      three ever notified the other party. AgreementScreen.tsx:787's own
--      reject-button toast already claims "requester notified" — it becomes
--      true once this lands, no client change needed there.
--   2. queue_tokens payment_status — a plain client-side update
--      (businessService.claimQueuePayment/confirmQueuePayment/
--      rejectQueuePaymentClaim, src/services/marketplace/businessService.ts:
--      390-406), never an RPC, so there was never anywhere to add a
--      notification — needs a new trigger. The only existing queue_tokens
--      trigger (notify_on_queue_called, 20260808) only covers status=CALLED,
--      confirmed by direct read — no payment_status branch exists anywhere.
--   3. bulk_deal_pledge_join / bulk_deal_pledge_claim_deposit — the OWNER was
--      never notified of a new pledge or a deposit claim, only the pledger
--      (on confirm/reject, which already worked). One RPC fix (claim_deposit)
--      closes both the 08 and 16 audit findings — same function either way.
-- ============================================================

-- ── 1) Agreement payment claim/confirm/reject ──
create or replace function public.agreement_claim_payment(
  p_id text, p_method text, p_amount integer default null,
  p_reference text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_agreement.status <> 'ACTIVE' then raise exception 'INVALID_TRANSITION'; end if;
  if v_agreement.payment_status not in ('UNPAID', 'REJECTED') then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;
  if v_agreement.agreed_price <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.agreements
  set payment_method = p_method,
      payment_status = 'PENDING_CONFIRM',
      payment_amount = agreed_price,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and status = 'ACTIVE'
    and payment_status in ('UNPAID', 'REJECTED');
  if not found then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.responder_user_id, 'AGREEMENT', 'Payment claim to verify',
      'The requester says they paid ₹' || v_agreement.agreed_price::text
        || ' for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" — confirm or reject.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end
$$;

create or replace function public.agreement_confirm_payment(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;
  update public.agreements
  set payment_status = 'PAID', status = 'DEPOSIT_PAID'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.requester_user_id, 'AGREEMENT', 'Payment confirmed ✓',
      'Your payment for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" was confirmed.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end $$;

create or replace function public.agreement_reject_payment(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;
  update public.agreements set payment_status = 'REJECTED'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.requester_user_id, 'AGREEMENT', 'Payment not verified',
      'Your payment claim for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" wasn''t confirmed. Try again.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end $$;

-- ── 2) Queue payment status — new trigger, none existed for payment_status ──
create or replace function public.notify_on_queue_payment_status() returns trigger as $$
declare
  v_biz record;
begin
  if new.payment_status is distinct from old.payment_status then
    select name, owner_user_id into v_biz from public.businesses where id = new.business_id;

    if new.payment_status = 'PENDING_CONFIRM' and v_biz.owner_user_id is not null then
      begin
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_biz.owner_user_id, 'QUEUE_UPDATE', 'Payment claim to verify',
          coalesce(new.customer_name, 'A customer') || ' says they paid'
            || coalesce(' ₹' || new.payment_amount::text, '') || ' — confirm or reject in your queue console.',
          '/business/' || new.business_id || '/manage/queue');
      exception when others then null;
      end;
    elsif new.payment_status = 'PAID' and new.customer_user_id is not null then
      begin
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (new.customer_user_id, 'QUEUE_UPDATE', 'Payment confirmed ✓',
          coalesce(v_biz.name, 'The shop') || ' confirmed your payment.', '/queues');
      exception when others then null;
      end;
    elsif new.payment_status = 'REJECTED' and new.customer_user_id is not null then
      begin
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (new.customer_user_id, 'QUEUE_UPDATE', 'Payment not verified',
          coalesce(v_biz.name, 'The shop') || ' couldn''t verify your payment. Please retry.', '/queues');
      exception when others then null;
      end;
    end if;
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_queue_payment_status on public.queue_tokens;
create trigger trg_notify_queue_payment_status
  after update on public.queue_tokens
  for each row execute function public.notify_on_queue_payment_status();

-- ── 3) Bulk-deal pledge join / deposit claim — notify the owner, not just the pledger ──
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

create or replace function public.bulk_deal_pledge_claim_deposit(
  p_deal_id text, p_method text, p_reference text default null
) returns public.bulk_deal_pledges
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI','CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid for update;
  if not found then raise exception 'NOT_PLEDGED'; end if;
  if v_pledge.deposit_status not in ('UNPAID','REJECTED') then raise exception 'INVALID_TRANSITION'; end if;

  if v_deal.deposit_amount is null then raise exception 'NO_DEPOSIT_REQUIRED'; end if;

  update public.bulk_deal_pledges
     set deposit_method = p_method,
         deposit_status = 'PENDING_CONFIRM',
         deposit_amount = v_deal.deposit_amount,
         deposit_reference = nullif(left(trim(coalesce(p_reference,'')), 200), '')
   where deal_id = p_deal_id and user_id = v_uid
  returning * into v_pledge;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_deal.owner_user_id, 'BULK_DEAL_DEPOSIT_CLAIMED', 'Deposit claim to verify',
      'A pledger says they paid the ₹' || v_deal.deposit_amount::text
        || ' deposit for "' || left(v_deal.title, 60) || '" — confirm or reject.',
      '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id);
  exception when others then null;
  end;

  return v_pledge;
end
$$;

revoke execute on function public.bulk_deal_pledge_claim_deposit(text, text, text) from public, anon;
grant execute on function public.bulk_deal_pledge_claim_deposit(text, text, text) to authenticated;
