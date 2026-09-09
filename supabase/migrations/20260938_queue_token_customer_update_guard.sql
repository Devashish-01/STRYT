-- ============================================================
-- 20260938 — CUSTOMER_QUEUE #Q1: a customer can mark their own queue token
-- PAID and SERVED from the browser.
--
-- Proven against production in a rolled-back transaction: seeded a WAITING /
-- NONE token worth 250, impersonated the customer with
-- `set local role authenticated`, and ran the exact statement the client SDK
-- would emit —
--
--   update public.queue_tokens set payment_status='PAID', status='SERVED'
--    where id = <own token>;
--
--   → SUCCEEDED, token became SERVED / PAID.
--   → the same update against ANOTHER user's token was correctly blocked.
--
-- So the blast radius is "your own token", not everyone's. That still means
-- free service, and a merchant whose payment reconciliation now says paid.
--
-- ── Why the policy alone can't fix it ─────────────────────────────────
-- queue_tokens_owner_update has USING but no WITH CHECK. For UPDATE, Postgres
-- reuses USING as the WITH CHECK when none is given — so the row is re-tested
-- for OWNERSHIP after the change, and passes, because the customer still owns
-- it. A policy predicate sees the new row; it cannot see WHICH COLUMNS moved.
-- Expressing "this role may only change these fields, and only to these
-- values" needs OLD and NEW together, which only a trigger has.
--
-- ── What a customer legitimately does ─────────────────────────────────
-- Exactly two things, both in businessService:
--   leaveQueueToken   → status = 'LEFT'
--   claimQueuePayment → payment_status = 'PENDING_CONFIRM' (+ method,
--                       amount, reference)
-- PENDING_CONFIRM is a claim, not a settlement: the merchant still confirms it
-- before it becomes PAID. That confirmation step is what makes it safe to let
-- the customer write the amount and reference — and it is exactly what the
-- exploit skipped.
--
-- ── The null-uid guard is load-bearing ────────────────────────────────
-- close_stale_queue_tokens updates queue_tokens from a scheduled sweep with no
-- JWT, so auth.uid() is null there. Without the early return this trigger would
-- raise NOT_YOUR_TOKEN and break the sweep — a regression worse than the bug.
-- Verified that function does update this table before writing this.
-- ============================================================

create or replace function public.enforce_queue_token_customer_update()
returns trigger
language plpgsql
set search_path = public
as $$
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
$$;

drop trigger if exists trg_enforce_queue_token_customer_update on public.queue_tokens;
create trigger trg_enforce_queue_token_customer_update
  before update on public.queue_tokens
  for each row
  execute function public.enforce_queue_token_customer_update();
