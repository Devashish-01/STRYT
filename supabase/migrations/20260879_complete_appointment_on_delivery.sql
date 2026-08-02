-- Delivered order → the appointment is finished.
--
-- Reported: "if the product is set for home delivery and the delivery has been
-- done, the appointment should be marked [closed out]."
--
-- Today `appointment_update_delivery_status` sets the delivery to DELIVERED,
-- stamps delivered_at, closes the batch and notifies the customer — but never
-- touches public.appointments. So a physically delivered order sat in its
-- pre-delivery state indefinitely.
--
-- Confirmed live before writing this: 1 delivery is DELIVERED and PAID while
-- its appointment is still ACCEPTED.
--
-- Why it doesn't self-heal: the only ACCEPTED → COMPLETED path is
-- `sweep_my_appointments`, which is TIME based — it requires
-- `scheduled_for <= now()`. A delivery completed ahead of its scheduled slot
-- (the normal case) is never swept, so the booking stays open.
--
-- For a DELIVERY order, handing the goods over IS fulfilment, so completion
-- should follow the delivery rather than the clock.
--
-- Implemented as a trigger, not inside the RPC, for the same reason as
-- 20260875's IN_PROGRESS trigger: the appointment's state is a function of its
-- delivery, so deriving it covers every path that could ever set DELIVERED
-- (today's RPC, a future admin fix, a manual correction) instead of relying on
-- each caller to remember.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `complete_appointment_on_delivery`.

create or replace function public.tg_complete_appointment_on_delivery()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- Only the moment a delivery becomes DELIVERED.
  if new.status is distinct from 'DELIVERED' then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  update public.appointments a
     set status = 'COMPLETED'
   where a.id = new.appointment_id
     -- Only home-delivery orders. An IN_STORE booking is completed by the
     -- business serving the customer, not by a courier.
     and a.fulfillment_type = 'DELIVERY'
     -- Never resurrect or overwrite a terminal state: a cancelled, rejected or
     -- no-show appointment stays exactly as it is, and an already-COMPLETED one
     -- isn't rewritten. PENDING is included because if the goods reached the
     -- customer, the order happened regardless of the paperwork.
     and a.status in ('PENDING', 'ACCEPTED');

  return new;
end $function$;

revoke all on function public.tg_complete_appointment_on_delivery() from public, anon;

drop trigger if exists trg_complete_appointment_on_delivery on public.appointment_deliveries;
create trigger trg_complete_appointment_on_delivery
  after update of status on public.appointment_deliveries
  for each row execute function public.tg_complete_appointment_on_delivery();

-- Backfill the orders already delivered before this trigger existed.
-- Deliberately NOT touching payment_status: "delivered" and "paid" are separate
-- facts, and a cash-on-delivery order can legitimately be one without the other.
update public.appointments a
   set status = 'COMPLETED'
  from public.appointment_deliveries d
 where d.appointment_id = a.id
   and d.status = 'DELIVERED'
   and a.fulfillment_type = 'DELIVERY'
   and a.status in ('PENDING', 'ACCEPTED');
