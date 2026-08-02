-- DLV-001 — a delivery that can't be completed had no exit.
--
-- `CANCELLED` was already in appointment_deliveries_status_check, already
-- filtered for in history views, and already rendered in the agent console —
-- but nothing in the system could ever write it. Customer absent, wrong
-- address, refused order, agent's shift ending mid-run: no path.
--
-- Compounding it: set_delivery_duty refuses to go off duty while any delivery
-- sits in ('ASSIGNED','EN_ROUTE','ARRIVED'), so an agent holding one
-- undeliverable order was stuck ON DUTY permanently with no in-app way out.
--
-- Verified against the live DB before writing this (the file-vs-applied rule):
--   • appointment_deliveries_status_check ALREADY allows 'CANCELLED'
--     → no constraint change needed here.
--   • appointment_deliveries_one_active is UNIQUE (appointment_id)
--     WHERE status = ANY('ASSIGNED','EN_ROUTE','ARRIVED') — an ALLOWLIST of
--     active states, not a denylist of terminal ones. 'CANCELLED' therefore
--     already falls outside the index, so an owner can reassign a cancelled
--     delivery without violating it. No index change needed.
--   • set_delivery_duty counts only those same three states, so cancelling
--     frees the agent with no change to that function.
--
-- Decision (D2): the agent REPORTS, the owner REASSIGNS. Cancelling a delivery
-- never touches the appointment — the customer keeps their order, it simply
-- has no live delivery row until someone is dispatched again.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `delivery_cancellation`.

-- ── 1. Cancellation columns ────────────────────────────────────────────────
alter table public.appointment_deliveries
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  text,
  add column if not exists cancel_reason text,
  add column if not exists cancel_note   text;

do $$ begin
  alter table public.appointment_deliveries
    add constraint appointment_deliveries_cancel_reason_check
    check (cancel_reason is null or cancel_reason in (
      'CUSTOMER_UNAVAILABLE','ADDRESS_PROBLEM','CUSTOMER_REFUSED',
      'UNSAFE','AGENT_EMERGENCY','OTHER'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.appointment_deliveries
    add constraint appointment_deliveries_cancelled_by_check
    check (cancelled_by is null or cancelled_by in ('AGENT','BUSINESS'));
exception when duplicate_object then null; end $$;

-- ── 2. cancel_delivery ─────────────────────────────────────────────────────
-- Callable by the assigned agent OR by owner/manager (appointments scope —
-- the same scope that governs the deliveries board they'd act from).
--
-- has_business_scope is revoked from `authenticated` on purpose; this function
-- is SECURITY DEFINER, so it evaluates the predicate as the definer. That is
-- the intended way to reach it — never expose it to the client directly.
create or replace function public.cancel_delivery(
  p_delivery_id text,
  p_reason      text,
  p_note        text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid        text := auth.uid()::text;
  v_row        public.appointment_deliveries%rowtype;
  v_is_agent   boolean;
  v_is_manager boolean;
  v_actor      text;
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_remaining  int;
  v_biz_name   text;
  v_owner_uid  text;
  v_customer   text;
  v_agent_uid  text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if p_reason is null or p_reason not in (
    'CUSTOMER_UNAVAILABLE','ADDRESS_PROBLEM','CUSTOMER_REFUSED',
    'UNSAFE','AGENT_EMERGENCY','OTHER'
  ) then
    raise exception 'INVALID_REASON';
  end if;

  -- "Something else" must say something. Enforced here as well as in the UI:
  -- the reason is the only thing the owner has to act on.
  if p_reason = 'OTHER' and v_note is null then
    raise exception 'Add a short note so the business knows what happened.';
  end if;

  -- Row lock: a cancel racing a status advance must have exactly one winner.
  select * into v_row from public.appointment_deliveries
   where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  -- Idempotent-safe: a double-tap, or a cancel landing after the agent already
  -- completed the drop, changes nothing rather than rewriting a closed record.
  if v_row.status in ('DELIVERED','CANCELLED') then
    raise exception 'This delivery is already closed.';
  end if;

  v_is_agent   := v_uid is not distinct from v_row.agent_user_id;
  v_is_manager := public.has_business_scope(v_row.business_id, v_uid, 'appointments');
  if not (v_is_agent or v_is_manager) then raise exception 'NOT_ALLOWED'; end if;
  v_actor := case when v_is_agent then 'AGENT' else 'BUSINESS' end;

  v_agent_uid := v_row.agent_user_id;

  update public.appointment_deliveries
     set status        = 'CANCELLED',
         -- Clear live_status too: a terminal delivery must not keep reporting
         -- "on the way" to the customer's tracker.
         live_status   = null,
         cancelled_at  = now(),
         cancelled_by  = v_actor,
         cancel_reason = p_reason,
         cancel_note   = v_note
   where id = p_delivery_id;

  -- If this was the last live stop of a run, close the run. Otherwise leave it
  -- running — one bad stop doesn't end the agent's shift.
  if v_row.batch_id is not null then
    select count(*) into v_remaining
      from public.appointment_deliveries
     where batch_id = v_row.batch_id
       and status in ('ASSIGNED','EN_ROUTE','ARRIVED');
    if v_remaining = 0 then
      update public.delivery_batches
         set status = 'COMPLETED', completed_at = now()
       where id = v_row.batch_id
         and status in ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS');
    end if;
  end if;

  -- ── Notify the other side ────────────────────────────────────────────────
  select b.name, b.owner_user_id into v_biz_name, v_owner_uid
    from public.businesses b where b.id = v_row.business_id;
  select a.customer_user_id into v_customer
    from public.appointments a where a.id = v_row.appointment_id;

  begin
    if v_actor = 'AGENT' then
      -- The owner has to reassign, so they're told who and why.
      if v_owner_uid is not null then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_owner_uid, 'QUEUE_UPDATE', 'Delivery couldn''t be completed',
                'A delivery was marked undeliverable and needs reassigning.',
                '/business/' || v_row.business_id || '/manage/deliveries');
      end if;
    else
      -- Owner cancelled: tell the agent so the job disappears from their run
      -- with an explanation rather than silently vanishing.
      if v_agent_uid is not null then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_agent_uid, 'QUEUE_UPDATE', 'Delivery cancelled',
                coalesce(v_biz_name, 'The business') || ' cancelled a delivery on your run.',
                '/delivery');
      end if;
    end if;

    -- The customer is told in both cases — their order is still live, it just
    -- needs a new driver. Deliberately vague about the reason: an internal
    -- dispatch note is not customer-facing copy.
    if v_customer is not null then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_customer, 'QUEUE_UPDATE', 'Delivery delayed',
              coalesce(v_biz_name, 'The business') || ' is arranging a new delivery for your order.',
              '/appointments');
    end if;
  exception when others then null; -- notifications are never load-bearing
  end;
end $function$;

revoke all on function public.cancel_delivery(text, text, text) from public, anon;
grant execute on function public.cancel_delivery(text, text, text) to authenticated;

-- ── 3. my_duty_blockers ────────────────────────────────────────────────────
-- Read-only companion to set_delivery_duty, so the UI can DISABLE the off-duty
-- toggle with a specific reason instead of letting the agent tap it and eat an
-- exception. Deliberately a NEW function rather than changing
-- set_delivery_duty's return type: that would need a DROP + CREATE of a live
-- function, and between the migration and the client deploy the old client
-- (which only inspects `error`) would read a returned "blocked" as success and
-- silently let an agent go off duty mid-run.
create or replace function public.my_duty_blockers()
returns table (blocking_count int, blocking_delivery_id text, blocking_batch_id text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  -- Mirrors set_delivery_duty's own predicate exactly. If that function's
  -- definition of "active" ever changes, change it here in the same migration.
  select count(*)::int,
         min(d.id) filter (where d.status in ('ASSIGNED','EN_ROUTE','ARRIVED'))
    into blocking_count, blocking_delivery_id
    from public.appointment_deliveries d
   where d.agent_user_id = v_uid
     and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED');

  if blocking_count = 0 then
    select count(*)::int, min(b.id)
      into blocking_count, blocking_batch_id
      from public.delivery_batches b
     where b.agent_user_id = v_uid
       and b.status in ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS');
  end if;

  return next;
end $function$;

revoke all on function public.my_duty_blockers() from public, anon;
grant execute on function public.my_duty_blockers() to authenticated;
