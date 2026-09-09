import { useEffect, useState } from "react";
import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { SafeImg } from "@/components/common";
import { Package, Phone, CheckCircle, Share2 } from "@/components/Icons";
import DeliveryStepper from "@/components/delivery/DeliveryStepper";
import { useApp } from "@/store";

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
export default function DeliveryTrackControl({ appointmentId, fallbackEtaText }: { appointmentId: string; fallbackEtaText?: string | null }) {
  const { showToast } = useApp();
  const [sharing, setSharing] = useState(false);
  const { data: d, refetch } = useQuery(
    () => deliveryService.myProgress(appointmentId),
    [appointmentId],
    `delivery:my-progress:${appointmentId}`,
  );

  // Active polling while delivery is underway so status transitions
  // (such as ARRIVED, revealing the handoff PIN) appear live without manual reload.
  useEffect(() => {
    if (!d || d.status === "DELIVERED" || d.status === "CANCELLED") return;
    const interval = setInterval(() => {
      refetch();
    }, 12000);

    function onFocus() {
      refetch();
    }
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [d, refetch]);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const token = await deliveryService.createTrackingToken(appointmentId);
      const url = `${window.location.origin}/track/${token}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Track Delivery · STRYT", url });
          return;
        } catch {
          // Fallback to clipboard if share cancelled or unsupported
        }
      }
      await navigator.clipboard.writeText(url);
      showToast("Tracking link copied to clipboard");
    } catch (e: any) {
      showToast(e?.message || "Could not generate tracking link");
    } finally {
      setSharing(false);
    }
  }

  // my_delivery_progress returns nothing until an agent is separately
  // assigned — a later, distinct step from the owner's ETA promise at Accept.
  // Without this, the customer sees nothing at all for however long that gap
  // lasts, even though the ETA they were told about is already sitting on
  // the appointment record.
  if (!d) {
    if (!fallbackEtaText) return null;
    return (
      <div className="card row gap-8 center-v" style={{ padding: "11px 12px", background: "var(--delivery-50)", border: "none", marginTop: 2 }}>
        <Package size={15} color="var(--delivery-600)" />
        <span className="small semi grow" style={{ color: "var(--delivery-600)" }}>Delivery accepted</span>
        <span className="tiny semi" style={{ color: "var(--delivery-600)" }}>{fallbackEtaText}</span>
      </div>
    );
  }

  if (d.status === "CANCELLED") {
    const reasonText =
      d.cancelReason === "CUSTOMER_UNAVAILABLE" ? "Customer was unavailable at the address."
      : d.cancelReason === "ADDRESS_PROBLEM" ? "Address or access issue encountered."
      : d.cancelReason === "CUSTOMER_REFUSED" ? "Delivery was refused."
      : d.cancelReason === "UNSAFE" ? "Delivery halted due to safety conditions."
      : d.cancelReason === "AGENT_EMERGENCY" ? "Rider experienced an emergency."
      : d.cancelNote || "Delivery could not be completed.";

    return (
      <div className="card col gap-6" style={{ padding: "11px 12px", background: "var(--red-50)", border: "none", marginTop: 2 }}>
        <div className="row gap-8 center-v">
          <Package size={15} color="var(--red-600)" />
          <span className="small semi grow" style={{ color: "var(--red-600)" }}>Delivery cancelled</span>
        </div>
        <div className="tiny muted">{reasonText}</div>
        {d.cancelNote && d.cancelReason && <div className="tiny muted">Note: {d.cancelNote}</div>}
        <div className="tiny muted">Please contact the store to arrange re-dispatch or pickup.</div>
      </div>
    );
  }

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
        <button
          type="button"
          className="icon-btn"
          style={{ width: 28, height: 28, color: "var(--delivery-600)" }}
          onClick={handleShare}
          disabled={sharing}
          title="Share tracking link"
          aria-label="Share tracking link"
        >
          <Share2 size={14} />
        </button>
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
        <div className="row gap-9 center-v" style={{ background: "var(--surface)", borderRadius: 10, padding: "8px 10px" }}>
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
        <div className="row gap-8 center-v" style={{ background: "var(--surface)", borderRadius: 10, padding: "8px 10px" }}>
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
