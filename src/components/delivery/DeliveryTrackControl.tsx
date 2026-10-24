import { useEffect, useRef, useState } from "react";
import { useQuery } from "@/hooks/useApi";
import { deliveryService } from "@/services";
import { SafeImg } from "@/components/common";
import { Package, Phone, Share2 } from "@/components/Icons";
import { Celebrate } from "@/components/Celebrate";
import { firstTime } from "@/lib/celebrated";
import { ORDER_STAGES, orderStageIndex } from "@/lib/deliveryStage";
import { JourneySteps } from "@/components/delivery/JourneySteps";
import { JourneyRoad } from "@/components/delivery/JourneyRoad";
import { etaDisplay, journeyFraction, milestoneIndex, stageCopy } from "@/lib/orderJourney";
import type { AppointmentRecord } from "@/types";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";
import { haptics } from "@/lib/haptics";
import { trackingUrl } from "@/lib/trackingLink";

/**
 * Customer's view of their delivery, from the moment the order is placed to the knock at the door.
 *
 * There is deliberately NO live map or rider location here — a recorded product decision, enforced server-side
 * (my_delivery_progress returns no coordinates, and get_tracking nulls them for the delivery branch), not just hidden in this
 * component. The tracker still feels live: the server works out "minutes away" from the rider's fresh position and returns only that
 * number, and the little rider on the shop-to-home strip glides along it as the number falls.
 *
 * The rider's name/phone/photo appear only once THIS delivery is actually under way, so an assigned-but-not-started order discloses
 * nothing about who's coming.
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
  const [celebrating, setCelebrating] = useState(false);
  const [popKey, setPopKey] = useState(0);
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

  const stageIdx = orderStageIndex({ status: orderStatus, readyAt }, d ? { status: d.status, pickedUp: d.pickedUp } : null);
  const stage = stageIdx >= 0 ? ORDER_STAGES[stageIdx] : null;
  const delivered = stage === "delivered";

  // A step forward while the screen is open deserves a beat: a tick under the thumb and the picture popping in.
  const lastStage = useRef<number | null>(null);
  useEffect(() => {
    if (stageIdx < 0) return;
    if (lastStage.current != null && stageIdx > lastStage.current) {
      haptics.success();
      setPopKey((k) => k + 1);
    }
    lastStage.current = stageIdx;
  }, [stageIdx]);

  // The one big moment: it arrived. Once per order per device.
  useEffect(() => {
    if (!delivered) return;
    if (firstTime(appointmentId)) {
      setCelebrating(true);
      haptics.success();
    }
  }, [delivered, appointmentId]);

  // The longest "minutes away" seen on this delivery is the start of the strip, so the rider glides closer as the number falls.
  const startEta = useRef<number | null>(null);
  if (d?.status === "EN_ROUTE" && d.etaMinutes != null) startEta.current = Math.max(startEta.current ?? 0, d.etaMinutes);

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

  if (d?.status === "CANCELLED") {
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

  // No tracker for an order that ended without being delivered, or a finished one that never had a delivery row.
  if (!stage || (!d && orderStatus === "COMPLETED")) return null;

  const arrived = d?.status === "ARRIVED";
  const copy = stageCopy(stage, arrived);
  const eta = d?.status === "EN_ROUTE" ? etaDisplay(d.etaMinutes) : null;
  // A computed "N min away" beats the owner's static promise once the rider is moving; fall back to that promise before then.
  const promised = (d?.etaText || fallbackEtaText || "").trim();
  const showPromise = !eta && !arrived && !delivered && stageIdx >= 1 && promised !== "";
  const here = milestoneIndex(stageIdx);
  const fraction = journeyFraction(stage, arrived, d?.etaMinutes, startEta.current);
  const code = (d?.status === "EN_ROUTE" || d?.status === "ARRIVED") && d.handoffCode && !d.handoffVerified ? d.handoffCode : null;

  return (
    <>
      {celebrating && <Celebrate onDone={() => setCelebrating(false)} />}
      <div className={`trk${delivered ? " is-done" : ""}`} aria-live="polite">
        <div className="trk-head">
          <span key={popKey} className={`trk-emoji${popKey > 0 ? " pop" : ""}`} aria-hidden="true">{copy.emoji}</span>
          <div style={{ minWidth: 0 }}>
            <div className="trk-title">{t(copy.headlineKey)}</div>
            <div className="trk-sub">{t(copy.subKey)}</div>
            {!delivered && <div className="trk-live" style={{ marginTop: 6 }}><i /> {t("trk_live")}</div>}
          </div>
          {eta && (
            <div className="trk-eta">
              {eta.kind === "now" ? <b style={{ fontSize: 17 }}>{t("trk_eta_now")}</b> : <><b>{eta.n}</b><span>{t("trk_eta_min")}</span></>}
            </div>
          )}
          {showPromise && (
            <div className="trk-eta">
              <span>{t("trk_eta_promised")}</span>
              <b style={{ fontSize: promised.length > 8 ? 14 : 20 }}>{promised}</b>
            </div>
          )}
        </div>

        <div className="trk-body">
          {/* Shop → home, with the rider gliding along it. Position comes from the stage and the server's minutes, never a location. */}
          <JourneyRoad fraction={fraction} delivered={delivered} label={t(copy.headlineKey)} />

          <JourneySteps here={here} delivered={delivered} />

          {/* Queue position while they wait their turn on a multi-stop run. */}
          {d?.status === "ASSIGNED" && (d.stopsBefore ?? 0) > 0 && (
            <div className="tiny muted">
              {(d.stopsBefore ?? 0) === 1 ? t("dlv_trk_ahead_one") : tf("dlv_trk_ahead", { n: d.stopsBefore ?? 0 })}
            </div>
          )}

          {/* The rider — revealed only once the delivery has started. */}
          {d?.agentRevealed && d.agentName && !delivered && (
            <div className="trk-person">
              <SafeImg src={d.agentAvatar ?? undefined} variant="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} />
              <div className="who">
                <div className="small semi ellipsis">{d.agentName}</div>
                <div className="tiny muted">{t("trk_rider_title")}</div>
              </div>
              {d.agentPhone && (
                <a className="trk-round" href={`tel:${d.agentPhone}`} aria-label={t("dlv_trk_call")}>
                  <Phone size={18} />
                </a>
              )}
            </div>
          )}

          {/* The customer's half of the hand-over: big enough to read across a doorstep. */}
          {code && (
            <div className="trk-code-card">
              <div className="small semi" style={{ color: "var(--delivery-800)" }}>{t("trk_code_title")}</div>
              <div className="trk-code" aria-label={code.split("").join(" ")}>
                {code.split("").map((c, i) => <b key={i}>{c}</b>)}
              </div>
              <div className="tiny muted">{t("trk_code_hint")}</div>
            </div>
          )}

          {!delivered && (
            <div className="trk-actions">
              {d?.businessPhone && (
                <a className="btn btn-outline btn-sm grow row gap-6 center" href={`tel:${d.businessPhone}`}>
                  <Phone size={14} /> {t("dlv_trk_call_shop")}
                </a>
              )}
              {d && (
                <button type="button" className="trk-round ghost" onClick={handleShare} disabled={sharing} title={t("dlv_trk_share")} aria-label={t("dlv_trk_share")}>
                  <Share2 size={17} />
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
