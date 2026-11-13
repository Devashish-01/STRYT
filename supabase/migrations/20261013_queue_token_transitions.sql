-- ============================================================
-- 20261013 — The queue-token state machine, enforced in one place (GAPS #41, #42)
--
-- queue_tokens are written straight from the app (businessService: call, serve,
-- arrived, no-show, leave, claim / confirm / reject / undo payment) with
-- compare-and-set filters. The only server check was
-- enforce_queue_token_customer_update, which:
--   #41  let a customer set payment_status only to PENDING_CONFIRM, so the
--        app's "undo my payment claim" (PENDING_CONFIRM -> UNPAID, MyQueues)
--        always failed with PAYMENT_STATUS_NOT_YOURS_TO_SET;
--   #42  let queue staff do anything (SERVED -> WAITING, EXPIRED -> CALLED,
--        PAID -> UNPAID …), let a customer turn ANY token into LEFT (a served
--        visit rewritten as "left"), and let a customer edit the amount on a
--        payment the shop had already confirmed.
-- The same trigger function now carries the whole table:
--
--   status       staff     WAITING -> CALLED | SERVED | LEFT ;  CALLED -> SERVED | LEFT
--                customer  WAITING | CALLED -> LEFT
--                SERVED, LEFT, EXPIRED are final for clients (EXPIRED is set by close_stale_queue_tokens)
--   payment      anyone    UNPAID | REJECTED -> PENDING_CONFIRM   (claim)
--                anyone    PENDING_CONFIRM -> UNPAID              (undo an unconfirmed claim)  ← #41
--                staff     PENDING_CONFIRM -> PAID | REJECTED     (settle)
--                staff     UNPAID | REJECTED -> PAID              (paid at the counter)
--                PAID is final for clients
--   method / amount / reference: a customer changes them only while making a claim.
--   business_id / customer_user_id never change.
--
-- Client roles only (current_user authenticated / anon); SECURITY DEFINER
-- functions and the cron sweep are untouched. enforce_queue_cancel_rules
-- (no leaving with a payment in progress) is unchanged and still applies.
-- Rollback: supabase/rollbacks/20261013_queue_token_transitions.rollback.sql
-- Test:     supabase/tests/queue_token_transitions.test.sql
-- ============================================================

create or replace function public.enforce_queue_token_customer_update()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_staff boolean;
  v_os text := old.status;
  v_ns text := new.status;
  v_op text := coalesce(old.payment_status, 'UNPAID');
  v_np text := coalesce(new.payment_status, 'UNPAID');
begin
  -- Server-side context (cron sweep, SECURITY DEFINER functions): nothing to restrict.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if v_uid is null then raise exception 'NOT_YOUR_TOKEN'; end if;

  v_staff := public.has_business_scope(old.business_id, v_uid, 'queue');
  if not v_staff and old.customer_user_id is distinct from v_uid then
    raise exception 'NOT_YOUR_TOKEN';
  end if;

  -- Ownership columns never move: a token must not be laundered into another shop or holder.
  if new.business_id is distinct from old.business_id
     or new.customer_user_id is distinct from old.customer_user_id then
    raise exception 'IMMUTABLE_FIELD';
  end if;

  if v_ns is distinct from v_os then
    if not (
      (v_staff and (v_os, v_ns) in (('WAITING', 'CALLED'), ('WAITING', 'SERVED'), ('WAITING', 'LEFT'),
                                    ('CALLED', 'SERVED'), ('CALLED', 'LEFT')))
      or (v_os in ('WAITING', 'CALLED') and v_ns = 'LEFT')
    ) then
      raise exception 'QUEUE_STATUS_NOT_YOURS_TO_SET' using errcode = '42501',
        hint = format('%s -> %s is not a move %s can make.', v_os, v_ns, case when v_staff then 'the shop' else 'the customer' end);
    end if;
  end if;

  if v_np is distinct from v_op then
    if not (
      (v_op in ('UNPAID', 'REJECTED') and v_np = 'PENDING_CONFIRM')
      or (v_op = 'PENDING_CONFIRM' and v_np = 'UNPAID')
      or (v_staff and v_op = 'PENDING_CONFIRM' and v_np in ('PAID', 'REJECTED'))
      or (v_staff and v_op in ('UNPAID', 'REJECTED') and v_np = 'PAID')
    ) then
      raise exception 'PAYMENT_STATUS_NOT_YOURS_TO_SET' using errcode = '42501',
        hint = format('%s -> %s is not a payment move %s can make.', v_op, v_np, case when v_staff then 'the shop' else 'the customer' end);
    end if;
  end if;

  -- The customer states the method / amount / reference only as part of a claim.
  if not v_staff
     and (new.payment_method is distinct from old.payment_method
          or new.payment_amount is distinct from old.payment_amount
          or new.payment_reference is distinct from old.payment_reference)
     and not (v_np = 'PENDING_CONFIRM' and v_op in ('UNPAID', 'REJECTED')) then
    raise exception 'PAYMENT_STATUS_NOT_YOURS_TO_SET' using errcode = '42501',
      hint = 'Payment details can only be given while claiming a payment.';
  end if;

  return new;
end
$function$;

revoke all on function public.enforce_queue_token_customer_update() from public, anon, authenticated;

-- unchanged trigger, re-stated so this file is self-contained
drop trigger if exists trg_enforce_queue_token_customer_update on public.queue_tokens;
create trigger trg_enforce_queue_token_customer_update
  before update on public.queue_tokens
  for each row execute function public.enforce_queue_token_customer_update();
