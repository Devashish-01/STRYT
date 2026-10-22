import type { BusinessDeliveryItem, CancelReason } from "@/services/engagement/deliveryService";

/**
 * What the owner should be told about a delivery in flight, from its timeline alone. Kept pure so the thresholds are
 * testable and the board only renders the result.
 *
 * `ok` = nothing to say; `warn` = worth a look; `bad` = act now.
 */
export type HealthTone = "ok" | "warn" | "bad";
export interface DeliveryHealth {
  tone: HealthTone;
  /** i18n key (with `n` minutes) for the line to show, or null when there is nothing to say. */
  key: string | null;
  minutes: number;
}

const MIN = 60_000;

/** Position older than this while the rider is out is no longer "live". */
export const LIVE_FOR_MS = 2 * MIN;
export const LOST_AFTER_MS = 10 * MIN;
/** Assigned but the rider hasn't picked the order up. */
export const PICKUP_SLOW_AFTER_MS = 10 * MIN;
/** Picked up but not on the way. */
export const START_SLOW_AFTER_MS = 5 * MIN;
/** At the door without completing. */
export const DOOR_SLOW_AFTER_MS = 20 * MIN;

type Timeline = Pick<BusinessDeliveryItem, "status" | "createdAt" | "pickedUpAt" | "startedAt" | "arrivedAt" | "positionAt">;

const mins = (ms: number) => Math.max(0, Math.round(ms / MIN));
const at = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);

export function deliveryHealth(d: Timeline, now: number): DeliveryHealth {
  const none: DeliveryHealth = { tone: "ok", key: null, minutes: 0 };

  if (d.status === "ASSIGNED") {
    if (!d.pickedUpAt) {
      const age = now - at(d.createdAt);
      if (age >= PICKUP_SLOW_AFTER_MS) return { tone: "warn", key: "dlv_health_not_picked_up", minutes: mins(age) };
      return none;
    }
    const sincePick = now - at(d.pickedUpAt);
    if (sincePick >= START_SLOW_AFTER_MS) return { tone: "warn", key: "dlv_health_not_started", minutes: mins(sincePick) };
    return none;
  }

  if (d.status === "EN_ROUTE") {
    const last = at(d.positionAt);
    if (Number.isNaN(last)) {
      // Out for a while with no position at all: sharing never started (or was refused).
      const since = now - at(d.startedAt);
      if (!Number.isNaN(since) && since >= 2 * MIN) return { tone: "bad", key: "dlv_health_no_location", minutes: mins(since) };
      return none;
    }
    const age = now - last;
    if (age >= LOST_AFTER_MS) return { tone: "bad", key: "dlv_health_location_lost", minutes: mins(age) };
    if (age >= LIVE_FOR_MS) return { tone: "warn", key: "dlv_health_location_stale", minutes: mins(age) };
    return none;
  }

  if (d.status === "ARRIVED") {
    const age = now - at(d.arrivedAt);
    if (!Number.isNaN(age) && age >= DOOR_SLOW_AFTER_MS) return { tone: "warn", key: "dlv_health_at_door", minutes: mins(age) };
    return none;
  }

  return none;
}

/** i18n key for why a delivery ended, shown to the owner so a cancellation isn't a mystery (D5). */
export function cancelReasonKey(reason: CancelReason | "ORDER_CANCELLED" | null): string | null {
  switch (reason) {
    case "CUSTOMER_UNAVAILABLE": return "dlv_cancel_customer_unavailable";
    case "ADDRESS_PROBLEM": return "dlv_cancel_address_problem";
    case "CUSTOMER_REFUSED": return "dlv_cancel_customer_refused";
    case "UNSAFE": return "dlv_cancel_unsafe";
    case "AGENT_EMERGENCY": return "dlv_cancel_agent_emergency";
    case "ORDER_CANCELLED": return "dlv_cancel_order_cancelled";
    case "OTHER": return "dlv_cancel_other";
    default: return null;
  }
}
