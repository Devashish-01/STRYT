import type { DeliveryStatus } from "@/services/engagement/deliveryService";

const META: Record<DeliveryStatus, { label: string; className: string }> = {
  ASSIGNED: { label: "Assigned", className: "badge-gray" },
  EN_ROUTE: { label: "On the way", className: "badge-delivery" },
  ARRIVED: { label: "Arrived", className: "badge-purple" },
  DELIVERED: { label: "Delivered", className: "badge-green" },
  CANCELLED: { label: "Cancelled", className: "badge-red" },
};

/** One status → badge, shared by every delivery surface (agent console, owner
 *  tracking page) instead of each screen hand-rolling its own color map. */
export default function DeliveryStatusPill({ status }: { status: string }) {
  const s = META[status as DeliveryStatus] ?? META.ASSIGNED;
  return <span className={`badge ${s.className}`}>{s.label}</span>;
}
