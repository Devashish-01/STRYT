import type { AppointmentRecord } from "@/types";

/**
 * Whether an order still belongs in the "live" lists (the owner's Upcoming, the customer's Upcoming).
 *
 * A slot booking is live until its time passes. A home-delivery order is not a slot: it is live until a rider hands it over or
 * someone cancels it, however late it runs — the way every delivery platform treats an order. The server enforces the same rule
 * (sweep_my_appointments never completes or cancels an accepted delivery order by the clock); this keeps the lists in step with it.
 */
export function isLiveOrder(
  a: Pick<AppointmentRecord, "status" | "fulfillmentType" | "scheduledForISO">,
  now: number = Date.now(),
): boolean {
  if (a.status !== "PENDING" && a.status !== "ACCEPTED") return false;
  if (a.fulfillmentType === "DELIVERY") return true;
  return new Date(a.scheduledForISO).getTime() > now;
}

/** How long a delivered order stays on the customer's Upcoming list before it moves to Past. */
export const RECENTLY_DELIVERED_MS = 3 * 60 * 60 * 1000;

/**
 * A home-delivery order that was handed over in the last few hours. It stays on the customer's Upcoming list in its "Delivered" state —
 * the moment worth seeing, with the celebration and "Order again" — instead of vanishing the instant the rider taps done.
 */
export function isRecentlyDelivered(
  a: Pick<AppointmentRecord, "status" | "fulfillmentType" | "createdAtISO">,
  now: number = Date.now(),
): boolean {
  return a.fulfillmentType === "DELIVERY" && a.status === "COMPLETED" && now - new Date(a.createdAtISO).getTime() < RECENTLY_DELIVERED_MS;
}
