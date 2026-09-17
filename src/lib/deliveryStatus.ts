import type { DeliveryLiveStatus, DeliveryStatus } from "@/services/engagement/deliveryService";

/** Maps the raw live-status vocabulary an agent pushes (LEAVING/ON_THE_WAY/
 *  ARRIVED/DONE) to the lifecycle status these steps track — mirrors
 *  appointment_update_delivery_status's own server-side mapping, for surfaces
 *  (like the public tracking page) that only ever see live_status, never the
 *  lifecycle `status` column directly. */
export function liveStatusToDeliveryStatus(liveStatus: DeliveryLiveStatus | string | null): DeliveryStatus {
  switch (liveStatus) {
    case "LEAVING":
    case "ON_THE_WAY":
      return "EN_ROUTE";
    case "ARRIVED":
      return "ARRIVED";
    case "DONE":
      return "DELIVERED";
    default:
      return "ASSIGNED";
  }
}
