import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SafeImg } from "@/components/common";
import { Phone, Share2, X, ShieldCheck, Copy, Check, MapPin } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/store";
import { deliveryService, type CustomerDeliveryProgress, type LiveRiderPosition } from "@/services/engagement/deliveryService";
import { trackingUrl } from "@/lib/trackingLink";
import { errorMessage } from "@/lib/errorMessage";
import { JourneySteps } from "@/components/delivery/JourneySteps";
import { JourneyRoad } from "@/components/delivery/JourneyRoad";
import { ORDER_STAGES, orderStageIndex } from "@/lib/deliveryStage";
import { etaDisplay, journeyFraction, milestoneIndex, stageCopy } from "@/lib/orderJourney";
import type { AppointmentRecord } from "@/types";
import DeliveryLiveMap from "./DeliveryLiveMap";

export interface DeliveryTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  progress: CustomerDeliveryProgress | null;
  orderStatus?: AppointmentRecord["status"];
  readyAt?: string | null;
}

export default function DeliveryTrackingModal({
  isOpen,
  onClose,
  appointmentId,
  progress,
  orderStatus = "ACCEPTED",
  readyAt,
}: DeliveryTrackingModalProps) {
  const { t, tf } = useI18n();
  const { showToast } = useApp();
  const [sharing, setSharing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Local live progress so modal stays updated even when open full-screen
  const [liveProgress, setLiveProgress] = useState<CustomerDeliveryProgress | null>(progress);

  useEffect(() => {
    setLiveProgress(progress);
  }, [progress]);

  // Sub-second Realtime WebSocket stream from rider
  const [livePos, setLivePos] = useState<LiveRiderPosition | null>(null);

  useEffect(() => {
    if (!isOpen || !appointmentId) return;
    const unsub = deliveryService.subscribeLivePosition(appointmentId, (pos) => {
      setLivePos(pos);
    });
    return unsub;
  }, [isOpen, appointmentId]);

  // Active modal polling (every 5 seconds) to catch stage transitions (PICKED_UP, ARRIVED, DELIVERED)
  const isFinished = liveProgress?.status === "DELIVERED" || liveProgress?.status === "CANCELLED";
  useEffect(() => {
    if (!isOpen || !appointmentId || isFinished) return;
    const interval = setInterval(async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const fresh = await deliveryService.myProgress(appointmentId);
        if (fresh) setLiveProgress(fresh);
      } catch {
        // Offline / silent fail
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, appointmentId, isFinished]);

  if (!isOpen) return null;

  const d = liveProgress;
  const stageIdx = orderStageIndex({ status: orderStatus, readyAt }, d ? { status: d.status, pickedUp: d.pickedUp } : null);
  const stage = stageIdx >= 0 ? ORDER_STAGES[stageIdx] : null;
  if (!stage) return null;

  const delivered = stage === "delivered";
  const arrived = d?.status === "ARRIVED";
  const copy = stageCopy(stage, arrived);
  const eta = d?.status === "EN_ROUTE" ? etaDisplay(d.etaMinutes) : null;
  const here = milestoneIndex(stageIdx);
  const fraction = journeyFraction(stage, arrived, d?.etaMinutes, null);
  const code = (d?.status === "EN_ROUTE" || d?.status === "ARRIVED") && d.handoffCode && !d.handoffVerified ? d.handoffCode : null;

  // Real-time coordinates take precedence over polled coordinates
  const effectiveLat = livePos?.lat ?? d?.agentLat;
  const effectiveLng = livePos?.lng ?? d?.agentLng;
  const effectiveHeading = livePos?.heading ?? d?.agentHeading;

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
          // Fallback to clipboard
        }
      }
      await navigator.clipboard.writeText(url);
      showToast(t("dlv_trk_link_copied") || "Tracking link copied to clipboard");
    } catch (e) {
      showToast(errorMessage(e, t("dlv_trk_link_failed") || "Failed to share tracking link"));
    } finally {
      setSharing(false);
    }
  }

  function handleCopyCode() {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    setCopiedCode(true);
    showToast(t("trk_code_copied") || "Delivery OTP copied!");
    setTimeout(() => setCopiedCode(false), 2000);
  }

  const modalContent = (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      {/* 1. Full-Screen Interactive Live Map Background */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        <DeliveryLiveMap
          riderLat={effectiveLat}
          riderLng={effectiveLng}
          riderHeading={effectiveHeading}
          riderName={d?.agentName}
          storeLat={d?.storeLat}
          storeLng={d?.storeLng}
          storeName={d?.storeName}
          destLat={d?.destLat}
          destLng={d?.destLng}
          destAddress={d?.destAddress}
          status={d?.status}
          etaMinutes={d?.etaMinutes}
          bottomSheetOffsetPx={280}
          interactive={true}
        />
      </div>

      {/* 2. Floating Top Header */}
      <div
        style={{
          position: "relative",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "calc(12px + var(--safe-area-top, 0px)) 16px 8px 16px",
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            pointerEvents: "auto",
            width: 42,
            height: 42,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface)",
            color: "var(--ink-700)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            border: "1px solid var(--line)",
            cursor: "pointer",
          }}
          aria-label="Close tracking map"
        >
          <X size={18} />
        </button>

        <div
          style={{
            pointerEvents: "auto",
            padding: "6px 14px",
            borderRadius: 999,
            background: "var(--surface)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
            border: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8, alignItems: "center", justifyContent: "center" }}>
            <span style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", background: "var(--brand-500)", opacity: 0.75, animation: "dlv-radar-pulse 2s infinite" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand-600)" }} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-900)" }}>{t(copy.headlineKey)}</span>
        </div>

        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          style={{
            pointerEvents: "auto",
            width: 42,
            height: 42,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface)",
            color: "var(--ink-700)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            border: "1px solid var(--line)",
            cursor: "pointer",
          }}
          aria-label="Share tracking link"
        >
          <Share2 size={17} />
        </button>
      </div>

      {/* Flexible Spacer */}
      <div style={{ flex: 1, pointerEvents: "none" }} />

      {/* 3. Zepto / Zomato Inspired Floating Bottom Sheet */}
      <div
        style={{
          position: "relative",
          zIndex: 20,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          background: "var(--surface)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.14)",
          borderTop: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "14px 18px",
          paddingBottom: "calc(16px + var(--safe-area-bottom, 0px))",
          maxHeight: "58vh",
          overflowY: "auto",
        }}
      >
        {/* Handle Indicator */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--ink-200)", margin: "-4px auto 4px auto", flexShrink: 0 }} />

        {/* Hero ETA Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--ink-900)", letterSpacing: "-0.02em" }}>
              {arrived
                ? (t("dlv_pub_arrived") || "Arrived outside your door!")
                : eta
                ? (eta.kind === "now" ? (t("trk_eta_now") || "Arriving now") : `Arriving in ~${eta.n} mins`)
                : t(copy.headlineKey)}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
              {d?.storeName ? `From ${d.storeName}` : t("trk_live") || "Live Order Delivery"}
            </div>
          </div>

          <div style={{ padding: "4px 10px", borderRadius: 999, background: "var(--green-50)", border: "1px solid var(--green-200)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green-500)" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green-700)" }}>
              {arrived ? (t("dlv_pub_arrived") || "Arrived") : (t("dlv_pub_on_way") || "Live")}
            </span>
          </div>
        </div>

        {/* Handoff OTP Code Card */}
        {code && (
          <div
            onClick={handleCopyCode}
            role="button"
            tabIndex={0}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: 16,
              background: "var(--brand-50)",
              border: "1px solid var(--brand-200)",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <ShieldCheck size={22} color="var(--brand-600)" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-900)" }}>{t("trk_code_title") || "Delivery PIN / OTP"}</div>
                <div style={{ fontSize: 11, color: "var(--brand-700)" }}>{t("trk_code_hint") || "Share code with delivery partner"}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 900, letterSpacing: "2px", color: "var(--brand-700)", background: "var(--surface)", padding: "3px 8px", borderRadius: 8, border: "1px solid var(--brand-200)" }}>
                {code}
              </span>
              {copiedCode ? <Check size={18} color="var(--green-600)" /> : <Copy size={16} color="var(--brand-600)" />}
            </div>
          </div>
        )}

        {/* Rider Profile Card */}
        {d?.agentRevealed && d.agentName && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, background: "var(--ink-50)", border: "1px solid var(--line)" }}>
            <SafeImg
              src={d.agentAvatar ?? undefined}
              variant="avatar"
              style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ellipsis" style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-900)" }}>{d.agentName}</div>
              <div style={{ fontSize: 11, color: "var(--ink-500)", display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                <span>🛵 {t("trk_rider_title") || "Delivery Partner"}</span>
                {Boolean(d.stopsBefore && d.stopsBefore > 0) && (
                  <>
                    <span>·</span>
                    <span style={{ color: "var(--brand-600)", fontWeight: 600 }}>
                      {d.stopsBefore === 1 ? t("dlv_trk_ahead_one") : tf("dlv_trk_ahead", { n: d.stopsBefore ?? 0 })}
                    </span>
                  </>
                )}
              </div>
            </div>
            {d.agentPhone && (
              <a
                href={`tel:${d.agentPhone}`}
                style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--green-500)", color: "white", textDecoration: "none", flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
                aria-label="Call delivery partner"
              >
                <Phone size={17} />
              </a>
            )}
          </div>
        )}

        {/* Destination Address Info */}
        {d?.destAddress && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line)" }}>
            <MapPin size={16} color="var(--red-500)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.4 }} className="clamp-2">
              <strong style={{ color: "var(--ink-900)" }}>Delivering to: </strong>
              {d.destAddress}
            </div>
          </div>
        )}

        {/* Journey Progress Road & Milestones */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6, borderTop: "1px solid var(--line)" }}>
          <JourneyRoad fraction={fraction} delivered={delivered} label={t(copy.headlineKey)} />
          <JourneySteps here={here} delivered={delivered} />
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined" && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
