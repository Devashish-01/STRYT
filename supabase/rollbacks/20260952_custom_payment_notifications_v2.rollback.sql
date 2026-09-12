-- ============================================================
-- Rollback for 20260952_custom_payment_notifications_v2.sql
-- Restores all replaced objects to their exact production catalog definitions
-- from supabase/snapshots/2026-09-13_after_20260958.sql.
-- ============================================================

-- ── Restore custom_payment_create ─────────────────────────
CREATE OR REPLACE FUNCTION public.custom_payment_create(p_target_type text, p_target_id text, p_amount numeric, p_method text, p_note text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS custom_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Unlike an appointment/queue claim, the owner has no pre-existing record
  -- to already be watching, so a claim could go unnoticed without a push.
  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_owner, 'CUSTOM_PAYMENT_RECEIVED', 'New payment received',
    coalesce(v_payer_name, 'A customer') || ' sent ' || p_amount::text || ' via ' || p_method,
    case when p_target_type = 'BUSINESS' then '/business/' || p_target_id || '/manage/payments'
         else '/provider/' || p_target_id || '/manage/money' end
  );

  return v_row;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.custom_payment_create(p_target_type text, p_target_id text, p_amount numeric, p_method text, p_note text, p_reference text) TO authenticated, postgres, service_role;

-- ── Restore custom_payment_confirm ─────────────────────────
CREATE OR REPLACE FUNCTION public.custom_payment_confirm(p_id text)
 RETURNS custom_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_row.payer_user_id, 'CUSTOM_PAYMENT_CONFIRMED', 'Payment confirmed',
    coalesce(v_row.target_name, 'The business') || ' confirmed your payment of ' || v_row.amount::text,
    case when v_row.target_type = 'BUSINESS' then '/business/' || v_row.target_id
         else '/provider/' || v_row.target_id end
  );

  return v_row;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.custom_payment_confirm(p_id text) TO authenticated, postgres, service_role;

-- ── Restore custom_payment_reject ─────────────────────────
CREATE OR REPLACE FUNCTION public.custom_payment_reject(p_id text)
 RETURNS custom_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_row.payer_user_id, 'CUSTOM_PAYMENT_REJECTED', 'Payment claim rejected',
    coalesce(v_row.target_name, 'The business') || ' couldn''t confirm your payment of ' || v_row.amount::text || ' — check the amount and try again',
    case when v_row.target_type = 'BUSINESS' then '/business/' || v_row.target_id
         else '/provider/' || v_row.target_id end
  );

  return v_row;
end
$function$
;
GRANT EXECUTE ON FUNCTION public.custom_payment_reject(p_id text) TO authenticated, postgres, service_role;

notify pgrst, 'reload schema';
