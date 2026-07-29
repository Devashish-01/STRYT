import { useState } from "react";
import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { useApp } from "@/store";
import { Package } from "@/components/Icons";
import { RowSkeleton } from "@/components/states";

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned", EN_ROUTE: "On the way", ARRIVED: "Arrived", DELIVERED: "Delivered", CANCELLED: "Cancelled",
};

/**
 * Owner/manager control on an appointment card: assign a delivery to a
 * delivery-scoped team member, and see the live status once assigned. Rendered
 * only when the delivery feature is enabled (gated at the call site).
 */
export default function DeliveryAssignControl({ appointmentId, businessId }: { appointmentId: string; businessId: string }) {
  const { showToast } = useApp();
  const { data: delivery, loading: deliveryLoading, refetch } = useQuery(() => deliveryService.forAppointment(appointmentId), [appointmentId]);
  const { data: team, loading: teamLoading } = useQuery(() => deliveryService.deliveryTeam(businessId), [businessId]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function assign(userId: string) {
    setBusy(true);
    try {
      await deliveryService.assignDelivery(appointmentId, userId);
      showToast("Delivery assigned");
      setPicking(false);
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't assign delivery");
    } finally {
      setBusy(false);
    }
  }

  const active = delivery && delivery.status !== "CANCELLED" && delivery.status !== "DELIVERED";
  // Distinguishes a first assignment (no warning needed) from a reassignment,
  // which silently mints a new handoff code server-side — invalidating
  // whatever code the customer was already shown.
  const isReassign = !!active;

  if (deliveryLoading || teamLoading) {
    return (
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 2 }}>
        <RowSkeleton />
      </div>
    );
  }

  return (
    <div className="col gap-8" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 2 }}>
      <div className="row gap-6 center-v tiny semi muted">
        <Package size={13} color="var(--delivery-600)" /> Delivery
      </div>

      {delivery ? (
        <div className="row between center-v">
          <div className="small">
            <span className="semi">{delivery.agentName}</span>
            <span className="muted"> · {STATUS_LABEL[delivery.status] ?? delivery.status}</span>
          </div>
          {active && !picking && (
            <button className="tiny semi" style={{ color: "var(--delivery-600)" }} onClick={() => setPicking(true)}>Reassign</button>
          )}
        </div>
      ) : !picking ? (
        <button className="btn btn-outline btn-sm row gap-6 center" style={{ borderColor: "var(--delivery-600)", color: "var(--delivery-600)" }} onClick={() => setPicking(true)}>
          <Package size={14} /> Assign delivery
        </button>
      ) : null}

      {picking && (
        <div className="col gap-6">
          {isReassign && (
            <div className="tiny muted">Reassigning generates a new handoff code — the current one stops working.</div>
          )}
          {(team ?? []).length === 0 ? (
            <div className="tiny muted">No delivery team members yet. Add one in Team &amp; access with the Delivery role.</div>
          ) : (
            <div className="row wrap gap-6">
              {(team ?? []).map((m) => (
                <button key={m.userId} className="chip" disabled={busy} onClick={() => assign(m.userId)}>
                  {m.name}{!m.onDuty && <span className="muted"> · Off duty</span>}
                </button>
              ))}
            </div>
          )}
          <button className="tiny muted" style={{ alignSelf: "flex-start" }} onClick={() => setPicking(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
