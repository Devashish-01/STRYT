import { useEffect, useState } from "react";
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

  return (
    <div
      className="fixed inset-0 z-[2000] flex flex-col bg-[var(--surface)] animate-fade-in overflow-hidden"
      style={{ touchAction: "none" }}
    >
      {/* 1. Full-Screen Interactive Live Map Background */}
      <div className="absolute inset-0 z-0">
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
          bottomSheetOffsetPx={260}
          interactive={true}
        />
      </div>

      {/* 2. Floating Top Header */}
      <div
        className="relative z-20 flex items-center justify-between px-4 py-2.5 pointer-events-none"
        style={{ paddingTop: "calc(12px + var(--safe-area-top, 0px))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center bg-[var(--surface)] text-[var(--ink-700)] shadow-md border border-[var(--line)] active:scale-95 transition-transform"
          aria-label="Close tracking map"
        >
          <X size={18} />
        </button>

        <div className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-[var(--surface)] shadow-md border border-[var(--line)] flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand-500)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--brand-600)]"></span>
          </span>
          <span className="text-xs font-bold text-[var(--ink-900)]">{t(copy.headlineKey)}</span>
        </div>

        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center bg-[var(--surface)] text-[var(--ink-700)] shadow-md border border-[var(--line)] active:scale-95 transition-transform"
          aria-label="Share tracking link"
        >
          <Share2 size={17} />
        </button>
      </div>

      {/* Flexible Spacer */}
      <div className="flex-1 pointer-events-none" />

      {/* 3. Zepto / Zomato Inspired Floating Bottom Sheet */}
      <div
        className="relative z-20 rounded-t-3xl bg-[var(--surface)] shadow-[0_-8px_32px_rgba(0,0,0,0.14)] border-t border-[var(--line)] flex flex-col gap-3.5 p-4.5 transition-all duration-300"
        style={{
          paddingBottom: "calc(16px + var(--safe-area-bottom, 0px))",
          maxHeight: "56vh",
          overflowY: "auto",
        }}
      >
        {/* Handle Indicator */}
        <div className="w-10 h-1 rounded-full bg-[var(--line)] mx-auto -mt-1 shrink-0" />

        {/* Hero ETA Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-black text-[var(--ink-900)] tracking-tight">
              {arrived
                ? (t("dlv_pub_arrived") || "Arrived outside your door!")
                : eta
                ? (eta.kind === "now" ? (t("trk_eta_now") || "Arriving now") : `Arriving in ~${eta.n} mins`)
                : t(copy.headlineKey)}
            </div>
            <div className="text-xs text-[var(--ink-500)] mt-0.5">
              {d?.storeName ? `From ${d.storeName}` : t("trk_live") || "Live Order Delivery"}
            </div>
          </div>

          <div className="px-3 py-1 rounded-full bg-[var(--green-50)] border border-[var(--green-200)] flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[var(--green-500)] animate-pulse" />
            <span className="text-xs font-semibold text-[var(--green-700)]">
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
            className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--brand-50)] border border-[var(--brand-200)] cursor-pointer active:scale-[0.99] transition-transform shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--brand-100)] flex items-center justify-center shrink-0">
                <ShieldCheck size={22} color="var(--brand-600)" />
              </div>
              <div>
                <div className="text-xs font-bold text-[var(--brand-900)]">{t("trk_code_title") || "Delivery PIN / OTP"}</div>
                <div className="text-xs text-[var(--brand-700)]">{t("trk_code_hint") || "Share code with delivery partner"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-mono font-black tracking-widest text-[var(--brand-700)] bg-[var(--surface)] px-2.5 py-1 rounded-lg border border-[var(--brand-200)]">
                {code}
              </span>
              {copiedCode ? <Check size={18} color="var(--green-600)" /> : <Copy size={16} color="var(--brand-600)" />}
            </div>
          </div>
        )}

        {/* Rider Profile Card */}
        {d?.agentRevealed && d.agentName && (
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--surface-muted)] border border-[var(--line)]">
            <SafeImg
              src={d.agentAvatar ?? undefined}
              variant="avatar"
              style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[var(--ink-900)] truncate">{d.agentName}</div>
              <div className="text-xs text-[var(--ink-500)] flex items-center gap-1">
                <span>🛵 {t("trk_rider_title") || "Delivery Partner"}</span>
                {d.stopsBefore && d.stopsBefore > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-[var(--brand-600)] font-medium">
                      {d.stopsBefore === 1 ? t("dlv_trk_ahead_one") : tf("dlv_trk_ahead", { n: d.stopsBefore })}
                    </span>
                  </>
                )}
              </div>
            </div>
            {d.agentPhone && (
              <a
                href={`tel:${d.agentPhone}`}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--green-500)] text-white shadow-md active:scale-95 transition-transform shrink-0"
                aria-label="Call delivery partner"
              >
                <Phone size={18} />
              </a>
            )}
          </div>
        )}

        {/* Destination Address Info */}
        {d?.destAddress && (
          <div className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--line)]">
            <MapPin size={16} className="text-[var(--red-500)] shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--ink-700)] line-clamp-2 leading-relaxed">
              <span className="font-semibold text-[var(--ink-900)]">Delivering to: </span>
              {d.destAddress}
            </div>
          </div>
        )}

        {/* Journey Progress Road & Milestones */}
        <div className="flex flex-col gap-2 pt-1 border-t border-[var(--line)]">
          <JourneyRoad fraction={fraction} delivered={delivered} label={t(copy.headlineKey)} />
          <JourneySteps here={here} delivered={delivered} />
        </div>
      </div>
    </div>
  );
}
