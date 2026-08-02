-- DLV-003 — a solo delivery's GPS pings were written as STATUS TRANSITIONS.
--
-- Batched runs have had `update_delivery_batch_position` since 20260848
-- precisely so a throttled background fix never has to pretend to be a status
-- change. Solo deliveries had no equivalent, so DeliveryConsole pushed them
-- through `appointment_update_delivery_status(id, 'ON_THE_WAY', lat, lng)`.
--
-- Failure that causes: the agent taps "Arrived" → status becomes ARRIVED; a
-- background fix already in flight lands 'ON_THE_WAY' a moment later and drags
-- the delivery back to EN_ROUTE. The customer's tracker regresses and the
-- handoff step disappears from the agent's own screen until the next refetch.
--
-- This is the batch function's exact shape, with two deliberate differences,
-- both because it is fed by a BACKGROUND ping rather than a user action:
--
--   1. It accepts ARRIVED as well as EN_ROUTE. Position matters most in the
--      last hundred metres, and it is only safe to keep streaming through
--      ARRIVED *because* the ping no longer carries a status.
--   2. A ping for an already-terminal delivery is a silent no-op, not
--      'NOT_ALLOWED'. A late fix from a backgrounded app is expected, not an
--      error, and must never resurrect a closed delivery. (The batch RPC
--      raises here; it predates this reasoning and is left alone rather than
--      changed underneath a working flow.)
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `delivery_solo_position`.

create or replace function public.update_delivery_position(
  p_delivery_id text,
  p_lat         double precision,
  p_lng         double precision,
  p_accuracy    double precision default null,
  p_heading     double precision default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90  or p_lat > 90  then raise exception 'INVALID_LATITUDE';  end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;

  -- Coordinates ONLY. This function must never touch status or live_status —
  -- that separation is the entire point of it existing.
  update public.appointment_deliveries
     set lat = p_lat, lng = p_lng
   where id = p_delivery_id
     and agent_user_id = v_uid
     and status in ('EN_ROUTE','ARRIVED');

  -- Intentionally no `if not found then raise`: see note 2 above.
end $function$;

revoke all on function public.update_delivery_position(text, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.update_delivery_position(text, double precision, double precision, double precision, double precision) to authenticated;
