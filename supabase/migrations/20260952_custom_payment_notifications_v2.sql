-- ============================================================
-- Migration: 20260952_custom_payment_notifications_v2.sql
-- Group 6: Custom Payments & Direct In-Person Transactions Overhaul
--
-- Fixes:
-- 1. ENTITY SCOPING: Stamps entity_type (BUSINESS / PROVIDER) and
--    entity_id (p_target_id) on CUSTOM_PAYMENT_RECEIVED so that
--    business and provider console notification lists do not drop rows.
-- 2. METADATA ENRICHMENT: Enriches CUSTOM_PAYMENT_RECEIVED with
--    paymentId, amount, paymentMethod, paymentRef, note, targetName,
--    payer avatar, statusPill ('Pending Confirmation'), tone ('warning'),
--    and inline actions ['CONFIRM_CUSTOM_PAYMENT', 'REJECT_CUSTOM_PAYMENT'].
-- 3. CONFIRMATION NOTIFICATIONS: Enriches CUSTOM_PAYMENT_CONFIRMED with
--    receipt details, amount, reference, statusPill ('Confirmed ✓'),
--    and actions ['VIEW_RECEIPT', 'VIEW_STORE'].
-- 4. REJECTION NOTIFICATIONS: Enriches CUSTOM_PAYMENT_REJECTED with
--    details, statusPill ('Rejected'), tone ('danger'), and actions
--    ['RETRY_PAYMENT', 'VIEW_STORE'].
-- ============================================================

create or replace function public.custom_payment_create(
  p_target_type text, p_target_id text, p_amount numeric, p_method text,
  p_note text default null, p_reference text default null
) returns public.custom_payments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_payer_name text;
  v_payer_avatar text;
  v_row public.custom_payments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS','PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_method not in ('UPI','CASH') then raise exception 'INVALID_METHOD'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name into v_owner, v_target_name
    from public.businesses b where b.id = p_target_id and b.status = 'ACTIVE';
  else
    select p.user_id, p.display_name into v_owner, v_target_name
    from public.providers p where p.id = p_target_id and p.status = 'ACTIVE';
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_owner = v_uid then raise exception 'OWNER_CANNOT_SELF_PAY'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_payer_name, v_payer_avatar
  from public.users u where u.id = v_uid;

  insert into public.custom_payments (
    target_type, target_id, target_owner_user_id, target_name,
    payer_user_id, payer_name, payer_avatar,
    amount, method, status, reference, note
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name,
    v_uid, v_payer_name, v_payer_avatar,
    p_amount, p_method, 'PENDING_CONFIRM',
    nullif(left(trim(coalesce(p_reference, '')), 200), ''),
    nullif(left(trim(coalesce(p_note, '')), 300), '')
  ) returning * into v_row;

  begin
    insert into public.notifications (
      user_id, type, title, body, deep_link, entity_type, entity_id, metadata
    ) values (
      v_owner,
      'CUSTOM_PAYMENT_RECEIVED',
      'Payment claim: ₹' || p_amount::text,
      coalesce(v_payer_name, 'A customer') || ' sent ₹' || p_amount::text || ' via ' || p_method ||
        case when p_note is not null and trim(p_note) <> '' then ' • "' || left(trim(p_note), 50) || '"' else '' end,
      case when p_target_type = 'BUSINESS' then '/business/' || p_target_id || '/manage/payments'
           else '/provider/' || p_target_id || '/manage/money' end,
      p_target_type,
      p_target_id,
      jsonb_build_object(
        'paymentId', v_row.id,
        'amount', p_amount,
        'amountLabel', 'Amount',
        'paymentMethod', p_method,
        'paymentRef', p_reference,
        'note', p_note,
        'targetType', p_target_type,
        'targetId', p_target_id,
        'targetName', v_target_name,
        'actorName', v_payer_name,
        'avatarUrl', v_payer_avatar,
        'statusPill', 'Pending Confirmation',
        'tone', 'warning',
        'actions', jsonb_build_array('CONFIRM_CUSTOM_PAYMENT', 'REJECT_CUSTOM_PAYMENT')
      )
    );
  exception when others then null;
  end;

  return v_row;
end
$$;

revoke execute on function public.custom_payment_create(text, text, numeric, text, text, text) from public, anon;
grant execute on function public.custom_payment_create(text, text, numeric, text, text, text) to authenticated;


create or replace function public.custom_payment_confirm(p_id text)
returns public.custom_payments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_row public.custom_payments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.custom_payments where id = p_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  v_allowed := v_row.target_owner_user_id = v_uid
    or (v_row.target_type = 'BUSINESS' and public.has_business_scope(v_row.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_row.status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.custom_payments set status = 'PAID', confirmed_at = now()
  where id = p_id and status = 'PENDING_CONFIRM'
  returning * into v_row;
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (
      user_id, type, title, body, deep_link, metadata
    ) values (
      v_row.payer_user_id,
      'CUSTOM_PAYMENT_CONFIRMED',
      'Payment confirmed ✓',
      coalesce(v_row.target_name, 'The business') || ' confirmed your payment of ₹' || v_row.amount::text,
      case when v_row.target_type = 'BUSINESS' then '/business/' || v_row.target_id
           else '/provider/' || v_row.target_id end,
      jsonb_build_object(
        'paymentId', v_row.id,
        'amount', v_row.amount,
        'amountLabel', 'Paid',
        'paymentMethod', v_row.method,
        'paymentRef', v_row.reference,
        'note', v_row.note,
        'targetType', v_row.target_type,
        'targetId', v_row.target_id,
        'targetName', v_row.target_name,
        'actorName', v_row.target_name,
        'statusPill', 'Confirmed ✓',
        'tone', 'success',
        'actions', jsonb_build_array('VIEW_RECEIPT', 'VIEW_STORE')
      )
    );
  exception when others then null;
  end;

  return v_row;
end
$$;

revoke execute on function public.custom_payment_confirm(text) from public, anon;
grant execute on function public.custom_payment_confirm(text) to authenticated;


create or replace function public.custom_payment_reject(p_id text)
returns public.custom_payments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_row public.custom_payments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.custom_payments where id = p_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  v_allowed := v_row.target_owner_user_id = v_uid
    or (v_row.target_type = 'BUSINESS' and public.has_business_scope(v_row.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_row.status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.custom_payments set status = 'REJECTED'
  where id = p_id and status = 'PENDING_CONFIRM'
  returning * into v_row;
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (
      user_id, type, title, body, deep_link, metadata
    ) values (
      v_row.payer_user_id,
      'CUSTOM_PAYMENT_REJECTED',
      'Payment claim rejected',
      coalesce(v_row.target_name, 'The business') || ' couldn''t confirm your payment of ₹' || v_row.amount::text || ' — check details or retry',
      case when v_row.target_type = 'BUSINESS' then '/business/' || v_row.target_id
           else '/provider/' || v_row.target_id end,
      jsonb_build_object(
        'paymentId', v_row.id,
        'amount', v_row.amount,
        'amountLabel', 'Claimed',
        'paymentMethod', v_row.method,
        'paymentRef', v_row.reference,
        'note', v_row.note,
        'targetType', v_row.target_type,
        'targetId', v_row.target_id,
        'targetName', v_row.target_name,
        'actorName', v_row.target_name,
        'statusPill', 'Rejected',
        'tone', 'danger',
        'actions', jsonb_build_array('RETRY_PAYMENT', 'VIEW_STORE')
      )
    );
  exception when others then null;
  end;

  return v_row;
end
$$;

revoke execute on function public.custom_payment_reject(text) from public, anon;
grant execute on function public.custom_payment_reject(text) to authenticated;
