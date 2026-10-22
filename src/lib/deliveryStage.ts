import type { AppointmentRecord } from "@/types";
import type { DeliveryStatus } from "@/services/engagement/deliveryService";

/**
 * The one progress line a customer follows for a home-delivery order, from the moment it is placed — the way Swiggy, Uber Eats and
 * DoorDash show it — instead of nothing until a rider exists. Pure: both the customer card and its tests use it.
 */
export const ORDER_STAGES = ["placed", "accepted", "packed", "assigned", "picked_up", "on_the_way", "delivered"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export interface StageDelivery {
  status: DeliveryStatus;
  pickedUp?: boolean;
}

/**
 * Index into ORDER_STAGES for where the order is now, or -1 when it is over without being delivered (cancelled, declined, no-show).
 * A cancelled delivery attempt does not move the order backwards past what the shop already did: it is back to "accepted"/"packed".
 */
export function orderStageIndex(
  order: Pick<AppointmentRecord, "status"> & { readyAt?: string | null },
  delivery: StageDelivery | null | undefined,
): number {
  switch (order.status) {
    case "PENDING":
      return 0;
    case "COMPLETED":
      return ORDER_STAGES.indexOf("delivered");
    case "ACCEPTED":
      break;
    default:
      return -1;
  }
  let idx = order.readyAt ? ORDER_STAGES.indexOf("packed") : ORDER_STAGES.indexOf("accepted");
  if (!delivery) return idx;
  switch (delivery.status) {
    case "ASSIGNED":
      idx = Math.max(idx, ORDER_STAGES.indexOf(delivery.pickedUp ? "picked_up" : "assigned"));
      break;
    case "EN_ROUTE":
    case "ARRIVED":
      idx = ORDER_STAGES.indexOf("on_the_way");
      break;
    case "DELIVERED":
      idx = ORDER_STAGES.indexOf("delivered");
      break;
    default:
      break; // CANCELLED attempt: stay where the shop left it
  }
  return idx;
}

/** i18n key for the line under the progress dots, for the stage the order is in before a rider is involved. */
export function stageLineKey(stage: OrderStage): string {
  switch (stage) {
    case "placed": return "dlv_trk_waiting_shop";
    case "accepted": return "dlv_trk_preparing";
    case "packed": return "dlv_trk_packed_waiting";
    default: return `dlv_stage_${stage}`;
  }
}
