import type { DeliveryLiveStatus, DeliveryStatus } from "@/services/engagement/deliveryService";

const STEPS: { key: DeliveryStatus; label: string }[] = [
  { key: "ASSIGNED", label: "Assigned" },
  { key: "EN_ROUTE", label: "On the way" },
  { key: "ARRIVED", label: "Arrived" },
  { key: "DELIVERED", label: "Delivered" },
];
const STEP_INDEX: Record<string, number> = { ASSIGNED: 0, EN_ROUTE: 1, ARRIVED: 2, DELIVERED: 3 };

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

/** Shared progress-dots stepper, replacing the four independent hand-rolled
 *  copies across the delivery agent console, the customer's tracking card,
 *  and the public tracking page. Always teal for "done" — the one delivery
 *  accent color, not a mix of green/teal depending on which screen drew it. */
export default function DeliveryStepper({ status, compact, showLabel = true }: { status: string; compact?: boolean; showLabel?: boolean }) {
  const idx = STEP_INDEX[status] ?? 0;
  const cancelled = status === "CANCELLED";
  const dotSize = compact ? 7 : 9;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row" style={{ gap: 4, alignItems: "center" }}>
        {STEPS.map((s, i) => {
          const done = !cancelled && i <= idx;
          return (
            <div key={s.key} className="row center-v" style={{ gap: 4, flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
              <span style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: done ? "var(--delivery-600)" : "var(--ink-200)", flexShrink: 0 }} />
              {i < STEPS.length - 1 && <span style={{ flex: 1, height: 2, background: !cancelled && i < idx ? "var(--delivery-600)" : "var(--ink-200)" }} />}
            </div>
          );
        })}
      </div>
      {showLabel && <div className="tiny muted">{cancelled ? "Cancelled" : STEPS[idx]?.label}</div>}
    </div>
  );
}
