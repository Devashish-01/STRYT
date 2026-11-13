-- Rollback for 20261013_queue_token_transitions.sql — restores the live definition read 2026-11-13
-- (from 20260938_queue_token_customer_update_guard.sql).
create or replace function public.enforce_queue_token_customer_update()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
begin
  -- Server-side context (cron sweep, SECURITY DEFINER maintenance) — no JWT,
  -- nothing to restrict. See close_stale_queue_tokens.
  if v_uid is null then
    return new;
  end if;

  -- Business owner or scoped team member: unrestricted. Their own RLS policy
  -- already decides whether they may touch this row at all.
  if public.has_business_scope(new.business_id, v_uid, 'queue') then
    return new;
  end if;

  -- Anyone who is neither staff nor the token holder should have been stopped
  -- by RLS; belt and braces in case a policy is ever widened.
  if old.customer_user_id is distinct from v_uid then
    raise exception 'NOT_YOUR_TOKEN';
  end if;

  -- The customer may leave the queue, and nothing else about status.
  if new.status is distinct from old.status and new.status <> 'LEFT' then
    raise exception 'QUEUE_STATUS_NOT_YOURS_TO_SET';
  end if;

  -- The customer may claim a payment for confirmation, never settle one.
  if new.payment_status is distinct from old.payment_status
     and new.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'PAYMENT_STATUS_NOT_YOURS_TO_SET';
  end if;

  -- Ownership columns are never the customer's to move — reassigning either
  -- would let a token be laundered into a different shop or holder.
  if new.business_id is distinct from old.business_id
     or new.customer_user_id is distinct from old.customer_user_id then
    raise exception 'IMMUTABLE_FIELD';
  end if;

  return new;
end
$function$;

revoke all on function public.enforce_queue_token_customer_update() from public, anon, authenticated;
