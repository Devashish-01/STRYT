import type { AppointmentRecord } from "@/types";
import type { AppointmentDelivery } from "@/services/engagement/deliveryService";

export type DashboardOrderStage =
  | "NEW"
  | "PACK"
  | "ASSIGN_RIDER"
  | "OUT_FOR_DELIVERY"
  | "READY_PICKUP";

/** True when a booking represents a physical catalog / delivery order rather than a pure appointment slot. */
export function isFulfillmentOrder(item: Pick<AppointmentRecord, "fulfillmentType" | "items">): boolean {
  return item.fulfillmentType === "DELIVERY" || (item.items?.length ?? 0) > 0;
}

/**
 * Splits Dashboard work cleanly so customer orders live in one continuous pipeline ("Orders Right Now")
 * instead of jumping out of ACTION NEEDED on Accept or splitting their payment claims into a second card.
 */
export function partitionDashboardWork(
  appointments: readonly AppointmentRecord[],
  rawClaims: readonly AppointmentRecord[],
): {
  ordersRightNow: AppointmentRecord[];
  pendingBookings: AppointmentRecord[];
  standaloneAppointmentClaims: AppointmentRecord[];
} {
  const rank = (a: AppointmentRecord) => {
    if (a.status === "PENDING") return 0;
    if (!a.readyAt) return 1;
    return 2;
  };

  const ordersRightNow = appointments
    .filter((a) => (a.status === "PENDING" || a.status === "ACCEPTED") && isFulfillmentOrder(a))
    .sort((a, b) => {
      const dr = rank(a) - rank(b);
      if (dr !== 0) return dr;
      return new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime();
    });

  const orderIds = new Set(ordersRightNow.map((o) => o.id));
  const pendingBookings = appointments.filter((a) => a.status === "PENDING" && !isFulfillmentOrder(a));
  const standaloneAppointmentClaims = rawClaims.filter((c) => c.status !== "PENDING" && !orderIds.has(c.id));

  return { ordersRightNow, pendingBookings, standaloneAppointmentClaims };
}

/** Resolves the current step of an order card and whether the signed-in owner/team member is carrying it. */
export function resolveOrderStage(
  item: Pick<AppointmentRecord, "status" | "readyAt" | "fulfillmentType">,
  delivery?: AppointmentDelivery | null,
  currentUserId?: string,
): { stage: DashboardOrderStage; isSelfRider: boolean } {
  if (item.status === "PENDING") {
    return { stage: "NEW", isSelfRider: false };
  }
  if (!item.readyAt) {
    return { stage: "PACK", isSelfRider: false };
  }
  if (item.fulfillmentType === "DELIVERY") {
    const activeDelivery = delivery && delivery.status !== "CANCELLED";
    if (activeDelivery) {
      return {
        stage: "OUT_FOR_DELIVERY",
        isSelfRider: !!currentUserId && delivery.agentUserId === currentUserId,
      };
    }
    return { stage: "ASSIGN_RIDER", isSelfRider: false };
  }
  return { stage: "READY_PICKUP", isSelfRider: false };
}

/** Accurate subtitle key for a standalone payment claim row in ACTION NEEDED. */
export function claimContextKey(item: Pick<AppointmentRecord, "fulfillmentType" | "items">): string {
  if (item.fulfillmentType === "DELIVERY") return "mdash_claim_delivery";
  if ((item.items?.length ?? 0) > 0) return "mdash_claim_order";
  return "mdash_claim_appointment";
}
