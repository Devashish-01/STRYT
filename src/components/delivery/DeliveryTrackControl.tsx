import { useState } from "react";
import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { useApp } from "@/store";
import { Package, MapPin } from "@/components/Icons";

/**
 * Customer control on their appointment card: shows the delivery status, the
 * live Track link (once the agent is on the way), and their handoff code to
 * show the agent. Rendered only when the delivery feature is on (gated at the
 * call site).
 */
export default function DeliveryTrackControl({ appointmentId }: { appointmentId: string }) {
  const { showToast } = useApp();
  const { data: delivery } = useQuery(() => deliveryService.forAppointment(appointmentId), [appointmentId]);
  const [opening, setOpening] = useState(false);

  if (!delivery || delivery.status === "CANCELLED") return null;

  const enRoute = delivery.status === "EN_ROUTE" || delivery.status === "ARRIVED";
  const label =
    delivery.status === "ASSIGNED" ? "A delivery agent is assigned"
    : delivery.status === "EN_ROUTE" ? "Your delivery is on the way"
    : delivery.status === "ARRIVED" ? "Your delivery agent has arrived"
    : "Delivered";

  async function track() {
    setOpening(true);
    try {
      const token = await deliveryService.generateTrackingToken(appointmentId);
      window.open(`/track/${token}`, "_blank");
    } catch (e: any) {
      showToast(e?.message || "Couldn't open tracking");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="card col gap-8" style={{ padding: "10px 12px", background: "var(--delivery-50)", border: "none", marginTop: 2 }}>
      <div className="row gap-8 center-v">
        <Package size={15} color="var(--delivery-600)" />
        <span className="small semi grow" style={{ color: "var(--delivery-600)" }}>{label}</span>
      </div>

      {enRoute && (
        <div className="row gap-8 center-v">
          <button className="btn btn-sm row gap-6 center grow" style={{ background: "var(--delivery-600)", color: "#fff" }} disabled={opening} onClick={track}>
            <MapPin size={14} /> {opening ? "Opening…" : "Track live"}
          </button>
          {delivery.handoffCode && (
            <div className="tiny semi" title="Show this code to the agent" style={{ letterSpacing: 2, color: "var(--delivery-600)", background: "#fff", padding: "6px 10px", borderRadius: 8 }}>
              {delivery.handoffCode}
            </div>
          )}
        </div>
      )}
      {enRoute && delivery.handoffCode && (
        <div className="tiny muted">Show code <b>{delivery.handoffCode}</b> to the agent to confirm handoff.</div>
      )}
    </div>
  );
}
