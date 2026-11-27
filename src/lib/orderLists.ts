import type { AppointmentRecord } from "@/types";
import { isAutoOrderNote } from "@/lib/orderLines";

/**
 * Distinguishes commerce fulfillment (grocery, food, pharmacy order with items/delivery)
 * from scheduled calendar/time-slot bookings (salon, doctor consultation, tutor).
 */
export function isOrderActivity(a: Pick<AppointmentRecord, "fulfillmentType" | "items" | "notes">): boolean {
  return a.fulfillmentType === "DELIVERY" || Boolean(a.items && a.items.length > 0) || isAutoOrderNote(a.notes, !!a.items?.length);
}

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

/**
 * Builds the deep-link into My Deals → Store Orders → Active (for live orders)
 * or History (for completed/cancelled orders), targeting that exact order card.
 */
export function myDealsOrderUrl(
  apt: Pick<AppointmentRecord, "id" | "status" | "fulfillmentType" | "scheduledForISO">,
  now: number = Date.now(),
): string {
  const tab = isLiveOrder(apt, now) ? "active" : "completed";
  return `/agreements?section=orders&tab=${tab}&orderId=${encodeURIComponent(apt.id)}`;
}
