import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { SafeImg } from "@/components/common";
import { Package, Phone, CheckCircle } from "@/components/Icons";
import DeliveryStepper from "@/components/delivery/DeliveryStepper";

/**
 * Customer's view of their delivery: progress only.
 *
 * There is deliberately NO live map or agent location here — that was withdrawn
 * as a product decision, and the restriction is enforced server-side
 * (my_delivery_progress returns no coordinates, and get_tracking nulls them for
 * the delivery branch), not just hidden in this component.
 *
 * The agent's name/phone/photo appear only once THIS delivery is actually under
 * way, so an assigned-but-not-started order discloses nothing about who's coming.
 */
export default function DeliveryTrackControl({ appointmentId }: { appointmentId: string }) {
  const { data: d } = useQuery(() => deliveryService.myProgress(appointmentId), [appointmentId], `delivery:my-progress:${appointmentId}`);

  if (!d || d.status === "CANCELLED") return null;

  const label =
    d.status === "ASSIGNED" ? "A delivery agent is assigned"
    : d.status === "EN_ROUTE" ? "Your delivery is on the way"
    : d.status === "ARRIVED" ? "Your delivery agent has arrived"
    : "Delivered";

  return (
    <div className="card col gap-9" style={{ padding: "11px 12px", background: "var(--delivery-50)", border: "none", marginTop: 2 }}>
      <div className="row gap-8 center-v">
        <Package size={15} color="var(--delivery-600)" />
        <span className="small semi grow" style={{ color: "var(--delivery-600)" }}>{label}</span>
        {d.etaText && d.status !== "DELIVERED" && (
          <span className="tiny semi" style={{ color: "var(--delivery-600)" }}>{d.etaText}</span>
        )}
      </div>

      {/* Progress stepper — the only "tracking" a customer gets. */}
      <DeliveryStepper status={d.status} compact />

      {/* Queue position while they wait their turn on a multi-stop run. */}
      {d.status === "ASSIGNED" && (d.stopsBefore ?? 0) > 0 && (
        <div className="tiny muted">
          {d.stopsBefore} {d.stopsBefore === 1 ? "delivery" : "deliveries"} ahead of yours.
        </div>
      )}

      {/* Agent identity — revealed only once the delivery has started. */}
      {d.agentRevealed && d.agentName && (
        <div className="row gap-9 center-v" style={{ background: "#fff", borderRadius: 10, padding: "8px 10px" }}>
          <SafeImg src={d.agentAvatar ?? undefined} variant="avatar" style={{ width: 30, height: 30, flexShrink: 0 }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="tiny semi ellipsis">{d.agentName}</div>
            <div className="tiny muted">Your delivery agent</div>
          </div>
          {d.agentPhone && (
            <a className="btn btn-delivery btn-sm row gap-6 center" style={{ flexShrink: 0 }} href={`tel:${d.agentPhone}`}>
              <Phone size={13} /> Call
            </a>
          )}
        </div>
      )}

      {/* Handoff code — the customer's half of the OTP exchange. */}
      {(d.status === "EN_ROUTE" || d.status === "ARRIVED") && d.handoffCode && !d.handoffVerified && (
        <div className="row gap-8 center-v" style={{ background: "#fff", borderRadius: 10, padding: "8px 10px" }}>
          <div className="grow tiny muted">Show this code to the agent</div>
          <div className="semi" style={{ letterSpacing: 3, fontSize: 16, color: "var(--delivery-600)" }}>{d.handoffCode}</div>
        </div>
      )}

      {d.status === "DELIVERED" && (
        <div className="row gap-6 center-v tiny" style={{ color: "var(--green-600)" }}>
          <CheckCircle size={14} /> Delivered
        </div>
      )}
    </div>
  );
}
