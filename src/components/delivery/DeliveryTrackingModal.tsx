import { useState } from "react";
import { SafeImg } from "@/components/common";
import { Phone, Share2, X, ShieldCheck, Copy, Check } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/store";
import { deliveryService, type CustomerDeliveryProgress } from "@/services/engagement/deliveryService";
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
  progress: d,
  orderStatus = "ACCEPTED",
  readyAt,
}: DeliveryTrackingModalProps) {
  const { t, tf } = useI18n();
  const { showToast } = useApp();
  const [sharing, setSharing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

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
      className="fixed inset-0 z-[2000] flex flex-col bg-[var(--surface)] animate-fade-in"
      style={{ touchAction: "none" }}
    >
      {/* Top Navigation Bar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] bg-[var(--surface)] z-20 shrink-0"
        style={{ paddingTop: "calc(12px + var(--safe-area-top, 0px))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface-muted)] text-[var(--ink-700)] active:scale-95 transition-transform"
          aria-label="Close tracking map"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-sm font-bold text-[var(--ink-900)]">{t(copy.headlineKey)}</span>
          <span className="text-xs text-[var(--ink-500)]">
            {eta ? (eta.kind === "now" ? (t("trk_eta_now") || "Arriving now") : `${eta.n} min away`) : t("trk_live") || "Live Tracking"}
          </span>
        </div>

        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface-muted)] text-[var(--ink-700)] active:scale-95 transition-transform"
          aria-label="Share tracking link"
        >
          <Share2 size={17} />
        </button>
      </div>

      {/* Live Map Area */}
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: "45vh" }}>
        <DeliveryLiveMap
          riderLat={d?.agentLat}
          riderLng={d?.agentLng}
          riderHeading={d?.agentHeading}
          riderName={d?.agentName}
          storeLat={d?.storeLat}
          storeLng={d?.storeLng}
          storeName={d?.storeName}
          destLat={d?.destLat}
          destLng={d?.destLng}
          destAddress={d?.destAddress}
          status={d?.status}
          etaMinutes={d?.etaMinutes}
          interactive={true}
        />
      </div>

      {/* Bottom Information Sheet */}
      <div
        className="bg-[var(--surface)] border-t border-[var(--line)] p-4 shadow-xl z-20 shrink-0 flex flex-col gap-3.5"
        style={{ paddingBottom: "calc(16px + var(--safe-area-bottom, 0px))", maxHeight: "45vh", overflowY: "auto" }}
      >
        {/* Rider Profile & Call */}
        {d?.agentRevealed && d.agentName && (
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--surface-muted)] border border-[var(--line)]">
            <SafeImg src={d.agentAvatar ?? undefined} variant="avatar" style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[var(--ink-900)] truncate">{d.agentName}</div>
              <div className="text-xs text-[var(--ink-500)]">
                {d.stopsBefore && d.stopsBefore > 0
                  ? (d.stopsBefore === 1 ? t("dlv_trk_ahead_one") : tf("dlv_trk_ahead", { n: d.stopsBefore }))
                  : (t("trk_rider_title") || "Delivery Partner")}
              </div>
            </div>
            {d.agentPhone && (
              <a
                href={`tel:${d.agentPhone}`}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--green-500)] text-white shadow-md active:scale-95 transition-transform"
                aria-label="Call delivery partner"
              >
                <Phone size={18} />
              </a>
            )}
          </div>
        )}

        {/* Handoff OTP Code Card */}
        {code && (
          <div
            onClick={handleCopyCode}
            role="button"
            tabIndex={0}
            className="flex items-center justify-between p-3 rounded-2xl bg-[var(--brand-50)] border border-[var(--brand-200)] cursor-pointer active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={22} color="var(--brand-600)" />
              <div>
                <div className="text-xs font-semibold text-[var(--brand-900)]">{t("trk_code_title") || "Delivery PIN / OTP"}</div>
                <div className="text-xs text-[var(--brand-600)]">{t("trk_code_hint") || "Share with delivery partner"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-mono font-black tracking-widest text-[var(--brand-700)]">
                {code}
              </span>
              {copiedCode ? <Check size={18} color="var(--green-600)" /> : <Copy size={16} color="var(--brand-600)" />}
            </div>
          </div>
        )}

        {/* Journey Progress Road & Milestones */}
        <div className="flex flex-col gap-2.5 pt-1">
          <JourneyRoad fraction={fraction} delivered={delivered} label={t(copy.headlineKey)} />
          <JourneySteps here={here} delivered={delivered} />
        </div>
      </div>
    </div>
  );
}
