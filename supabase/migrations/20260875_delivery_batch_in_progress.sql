-- DLV-008 — `IN_PROGRESS` was a declared batch state that nothing ever set.
--
-- delivery_batches_status_check allows it, DeliveryBatchStatus declares it,
-- update_delivery_batch_position accepts it, and DeliveryConsole treats it as
-- active alongside ACCEPTED — but no code path ever wrote it. A batch went
-- PENDING_ACCEPTANCE → ACCEPTED → COMPLETED and never passed through.
--
-- Resolved by WIRING it rather than deleting it: "accepted but not started"
-- and "actively out on the road" are genuinely different things for an owner
-- watching the board, and the vocabulary already existed to say so.
--
-- Implemented as a trigger rather than by editing
-- appointment_update_delivery_status, so the run's state can't drift out of
-- step with its stops no matter which path moves a stop off ASSIGNED (the
-- status RPC today, a reassignment or an admin fix tomorrow). The batch's
-- state is a function of its stops; deriving it is more robust than
-- remembering to set it in every caller.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `delivery_batch_in_progress`.

create or replace function public.tg_delivery_batch_in_progress()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- Only interested in a stop leaving ASSIGNED while attached to a run.
  if new.batch_id is null then return new; end if;
  if new.status = 'ASSIGNED' then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  -- ACCEPTED → IN_PROGRESS only. Never walks a run backwards out of
  -- COMPLETED/CANCELLED, and never promotes one still awaiting acceptance.
  update public.delivery_batches
     set status = 'IN_PROGRESS'
   where id = new.batch_id
     and status = 'ACCEPTED';

  return new;
end $function$;

-- A trigger function isn't RPC-callable (PostgREST won't expose a `trigger`
-- return type), but it's SECURITY DEFINER and would otherwise carry the default
-- PUBLIC execute grant. Revoked to match every other function in this schema —
-- see 20260854_revoke_anon_on_delivery_rpcs.sql.
revoke all on function public.tg_delivery_batch_in_progress() from public, anon;

drop trigger if exists trg_delivery_batch_in_progress on public.appointment_deliveries;
create trigger trg_delivery_batch_in_progress
  after update of status on public.appointment_deliveries
  for each row execute function public.tg_delivery_batch_in_progress();
