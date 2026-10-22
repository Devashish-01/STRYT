import { useEffect, useState } from "react";
import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { SafeImg } from "@/components/common";
import { Package, Phone, CheckCircle, Share2 } from "@/components/Icons";
import OrderProgress from "@/components/delivery/OrderProgress";
import { ORDER_STAGES, orderStageIndex, stageLineKey } from "@/lib/deliveryStage";
import type { AppointmentRecord } from "@/types";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";
import { trackingUrl } from "@/lib/trackingLink";

/**
 * Customer's view of their delivery: progress only.
 *
 * There is deliberately NO live map or agent location here — that was withdrawn
 * as a product decision, and the restriction is enforced server-side
 * (my_delivery_progress returns no coordinates, and get_tracking nulls them for
 * the delivery branch), not just hidden in this component. What the customer does get is a time:
 * my_delivery_progress works out "minutes away" on the server from the rider's fresh position and returns only that number.
 *
 * The agent's name/phone/photo appear only once THIS delivery is actually under
 * way, so an assigned-but-not-started order discloses nothing about who's coming.
 */
export default function DeliveryTrackControl({ appointmentId, fallbackEtaText, orderStatus = "ACCEPTED", readyAt }: {
  appointmentId: string;
  fallbackEtaText?: string | null;
  /** The order's own status and when the shop packed it: the progress line starts when the order is placed, not when a rider exists. */
  orderStatus?: AppointmentRecord["status"];
  readyAt?: string | null;
}) {
  const { showToast } = useApp();
  const { t, tf } = useI18n();
  const [sharing, setSharing] = useState(false);
  const [readyBusy, setReadyBusy] = useState(false);
  const { data: d, refetch } = useQuery(
    () => deliveryService.myProgress(appointmentId),
    [appointmentId],
    `delivery:my-progress:${appointmentId}`,
  );

  // Keep the card current for as long as the order is live — including the long wait for a shop to accept, pack and send someone,
  // when there is no delivery row yet (the old version only started once one existed, so the customer saw nothing change until
  // they reopened the app) and after a failed attempt, when a new rider is about to be sent. Delivery rows are not pushed to the
  // customer (they can't read that table), so this poll plus the notifications are what keep it live.
  const orderOver = orderStatus === "COMPLETED" || orderStatus === "CANCELLED" || orderStatus === "REJECTED" || orderStatus === "NO_SHOW";
  const finished = orderOver || d?.status === "DELIVERED";
  useEffect(() => {
    if (finished) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
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
  }, [finished, refetch]);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const token = await deliveryService.createTrackingToken(appointmentId);
      const url = trackingUrl(token);
      if (navigator.share) {
        try {
          await navigator.share({ title: "Track Delivery · STRYT", url });
          return;
        } catch {
          // Fallback to clipboard if share cancelled or unsupported
        }
      }
      await navigator.clipboard.writeText(url);
      showToast(t("dlv_trk_link_copied"));
    } catch (e) {
      showToast(errorMessage(e, t("dlv_trk_link_failed")));
    } finally {
      setSharing(false);
    }
  }

  async function readyNow() {
    if (readyBusy) return;
    setReadyBusy(true);
    try {
      const sent = await deliveryService.readyForRedelivery(appointmentId);
      showToast(sent ? t("dlv_trk_ready_sent") : t("dlv_trk_ready_throttled"));
    } catch (e) {
      showToast(errorMessage(e, "Couldn't send — try again"));
    } finally {
      setReadyBusy(false);
    }
  }

  // my_delivery_progress returns nothing until an agent is separately
  // assigned — a later, distinct step from the owner's ETA promise at Accept.
  // Without this, the customer sees nothing at all for however long that gap
  // lasts, even though the ETA they were told about is already sitting on
  // the appointment record.
  // No delivery yet: the order is waiting for the shop to accept, pack it, or send someone. Say which, with the same progress line
  // the rest of the journey uses (it used to show nothing at all unless the owner had typed an ETA).
  const stageIdx = orderStageIndex({ status: orderStatus, readyAt }, d ? { status: d.status, pickedUp: d.pickedUp } : null);
  if (!d) {
    if (stageIdx < 0 || orderStatus === "COMPLETED") return null;
    return (
      <div className="card col gap-8" style={{ padding: "11px 12px", background: "var(--delivery-50)", border: "none", marginTop: 2 }}>
        <div className="row gap-8 center-v">
          <Package size={15} color="var(--delivery-600)" />
          <span className="small semi grow" style={{ color: "var(--delivery-600)" }}>{t(stageLineKey(ORDER_STAGES[stageIdx]))}</span>
          {fallbackEtaText && stageIdx >= 1 && <span className="tiny semi" style={{ color: "var(--delivery-600)" }}>{fallbackEtaText}</span>}
        </div>
        <OrderProgress index={stageIdx} compact />
      </div>
    );
  }

  if (d.status === "CANCELLED") {
    const reasonText =
      d.cancelReason === "CUSTOMER_UNAVAILABLE" ? t("dlv_trk_cancel_unavailable")
      : d.cancelReason === "ADDRESS_PROBLEM" ? t("dlv_trk_cancel_address")
      : d.cancelReason === "CUSTOMER_REFUSED" ? t("dlv_trk_cancel_refused")
      : d.cancelReason === "UNSAFE" ? t("dlv_trk_cancel_unsafe")
      : d.cancelReason === "AGENT_EMERGENCY" ? t("dlv_trk_cancel_emergency")
      : (d.cancelReason as string | null | undefined) === "ORDER_CANCELLED" ? t("dlv_trk_cancel_order")
      : d.cancelNote || t("dlv_trk_cancel_default");
    // When the customer was the reason (or the address was), they can tell the shop they're ready for another attempt.
    const canRetry = d.cancelReason === "CUSTOMER_UNAVAILABLE" || d.cancelReason === "ADDRESS_PROBLEM";

    return (
      <div className="card col gap-6" style={{ padding: "11px 12px", background: "var(--red-50)", border: "none", marginTop: 2 }}>
        <div className="row gap-8 center-v">
          <Package size={15} color="var(--red-600)" />
          <span className="small semi grow" style={{ color: "var(--red-600)" }}>{t("dlv_trk_cancelled")}</span>
        </div>
        <div className="tiny muted">{reasonText}</div>
        {d.cancelNote && d.cancelReason && <div className="tiny muted">Note: {d.cancelNote}</div>}
        <div className="tiny muted">{t("dlv_trk_contact_store")}</div>
        <div className="row gap-8">
          {canRetry && (
            <button className="btn btn-delivery btn-sm grow" disabled={readyBusy} onClick={readyNow}>{t("dlv_trk_ready_now")}</button>
          )}
          {d.businessPhone && (
            <a className="btn btn-outline btn-sm grow row gap-6 center" href={`tel:${d.businessPhone}`}>
              <Phone size={13} /> {t("dlv_trk_call_shop")}
            </a>
          )}
        </div>
      </div>
    );
  }

  const label =
    d.status === "ASSIGNED" ? (d.pickedUp ? t("dlv_trk_picked_up") : t("dlv_trk_assigned"))
    : d.status === "EN_ROUTE" ? t("dlv_trk_on_way")
    : d.status === "ARRIVED" ? t("dlv_trk_arrived")
    : t("dlv_trk_delivered");

  // A computed "N min away" beats the owner's static promise once the rider is moving; fall back to that promise otherwise.
  const timeText = d.status === "DELIVERED" ? null
    : d.etaMinutes != null ? tf("dlv_trk_eta_min", { n: d.etaMinutes })
    : d.etaText;

  return (
    <div className="card col gap-9" style={{ padding: "11px 12px", background: "var(--delivery-50)", border: "none", marginTop: 2 }}>
      <div className="row gap-8 center-v">
        <Package size={15} color="var(--delivery-600)" />
        <span className="small semi grow" style={{ color: "var(--delivery-600)" }}>{label}</span>
        {timeText && d.status !== "ARRIVED" && (
          <span className="tiny semi" style={{ color: "var(--delivery-600)" }}>{timeText}</span>
        )}
        <button
          type="button"
          className="icon-btn"
          style={{ width: 28, height: 28, color: "var(--delivery-600)" }}
          onClick={handleShare}
          disabled={sharing}
          title={t("dlv_trk_share")}
          aria-label={t("dlv_trk_share")}
        >
          <Share2 size={14} />
        </button>
      </div>

      {/* Progress line — the only "tracking" a customer gets. It starts at the order, not at the rider. */}
      <OrderProgress index={stageIdx} compact />

      {/* Queue position while they wait their turn on a multi-stop run. */}
      {d.status === "ASSIGNED" && (d.stopsBefore ?? 0) > 0 && (
        <div className="tiny muted">
          {(d.stopsBefore ?? 0) === 1 ? t("dlv_trk_ahead_one") : tf("dlv_trk_ahead", { n: d.stopsBefore ?? 0 })}
        </div>
      )}

      {/* Agent identity — revealed only once the delivery has started. */}
      {d.agentRevealed && d.agentName && (
        <div className="row gap-9 center-v" style={{ background: "var(--surface)", borderRadius: 10, padding: "8px 10px" }}>
          <SafeImg src={d.agentAvatar ?? undefined} variant="avatar" style={{ width: 30, height: 30, flexShrink: 0 }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="tiny semi ellipsis">{d.agentName}</div>
            <div className="tiny muted">{t("dlv_trk_your_agent")}</div>
          </div>
          {d.agentPhone && (
            <a className="btn btn-delivery btn-sm row gap-6 center" style={{ flexShrink: 0 }} href={`tel:${d.agentPhone}`}>
              <Phone size={13} /> {t("dlv_trk_call")}
            </a>
          )}
        </div>
      )}

      {/* The shop is reachable from the moment the order is dispatched, not only once a rider is on the way. */}
      {d.status !== "DELIVERED" && d.businessPhone && (
        <a className="btn btn-outline btn-sm row gap-6 center" href={`tel:${d.businessPhone}`}>
          <Phone size={13} /> {t("dlv_trk_call_shop")}
        </a>
      )}

      {/* Handoff code — the customer's half of the OTP exchange. */}
      {(d.status === "EN_ROUTE" || d.status === "ARRIVED") && d.handoffCode && !d.handoffVerified && (
        <div className="row gap-8 center-v" style={{ background: "var(--surface)", borderRadius: 10, padding: "8px 10px" }}>
          <div className="grow tiny muted">{t("dlv_trk_show_code")}</div>
          <div className="semi" style={{ letterSpacing: 3, fontSize: 16, color: "var(--delivery-600)" }}>{d.handoffCode}</div>
        </div>
      )}

      {d.status === "DELIVERED" && (
        <div className="row gap-6 center-v tiny" style={{ color: "var(--green-600)" }}>
          <CheckCircle size={14} /> {t("dlv_trk_delivered")}
        </div>
      )}
    </div>
  );
}
