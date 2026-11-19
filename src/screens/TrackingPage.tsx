import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { SafeImg } from "@/components/common";
import { config } from "@/config";
import { JourneySteps } from "@/components/delivery/JourneySteps";
import { JourneyRoad } from "@/components/delivery/JourneyRoad";
import { ORDER_STAGES } from "@/lib/deliveryStage";
import { journeyFraction, milestoneIndex, stageCopy } from "@/lib/orderJourney";
import { liveStatusToDeliveryStatus } from "@/lib/deliveryStatus";
import { EVENTS, track } from "@/lib/analytics";
import { useI18n } from "@/lib/i18n";
import DeliveryLiveMap from "@/components/delivery/DeliveryLiveMap";

const anonSb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  // This page is public and sessionless. Without these the second client shares the app's storage key and warns about
  // multiple GoTrue instances.
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const STATUS_LABELS: Record<string, { emoji: string; key: string }> = {
  ASSIGNED:   { emoji: "📦", key: "dlv_pub_assigned" },
  LEAVING:    { emoji: "🚶", key: "dlv_pub_leaving" },
  ON_THE_WAY: { emoji: "🛵", key: "dlv_pub_on_way" },
  ARRIVED:    { emoji: "📍", key: "dlv_pub_arrived" },
  WORKING:    { emoji: "🔧", key: "dlv_pub_working" },
  DONE:       { emoji: "✅", key: "dlv_pub_done" },
  CANCELLED:  { emoji: "⚠️", key: "dlv_pub_cancelled" },
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function TrackingPage() {
  const { t, tf } = useI18n();
  const { token } = useParams<{ token: string }>();

  const [expired, setExpired] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerName, setProviderName] = useState("");
  const [providerAvatar, setProviderAvatar] = useState("");
  const [providerLat, setProviderLat] = useState<number | null>(null);
  const [providerLng, setProviderLng] = useState<number | null>(null);
  const [agentHeading, setAgentHeading] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState("ON_THE_WAY");
  const [agreementId, setAgreementId] = useState("");
  const [eta, setEta] = useState("");
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [stopsBefore, setStopsBefore] = useState<number | null>(null);
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLng, setStoreLng] = useState<number | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [isDelivery, setIsDelivery] = useState(false);

  const prevPos = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const speedKmh = useRef(18); // default estimated city speed

  // Initial data load
  const loadData = useCallback(async () => {
    if (!token || !token.trim()) {
      setLoading(false);
      setInvalidLink(true);
      return;
    }
    setLoading(true);
    setNetError(null);
    setExpired(false);
    setInvalidLink(false);

    try {
      const { data, error } = await anonSb.rpc("get_tracking", { p_token: token });
      if (error) {
        if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
          setNetError(error.message || "Network error. Please check your connection.");
          setLoading(false);
          return;
        }
        setExpired(true);
        setLoading(false);
        track(EVENTS.SHARE_LINK_OPENED, { link_type: "tracking", is_valid: false });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      track(EVENTS.SHARE_LINK_OPENED, { link_type: "tracking", is_valid: !!row });
      if (!row) {
        setExpired(true);
        setLoading(false);
        return;
      }
      setAgreementId(row.agreement_id);
      setProviderLat(row.provider_lat ?? null);
      setProviderLng(row.provider_lng ?? null);
      const deliveryMode = row.is_delivery === true || (row.stops_before !== null && row.stops_before !== undefined);
      setIsDelivery(deliveryMode);
      setLiveStatus(row.live_status ?? (deliveryMode ? "ASSIGNED" : "ON_THE_WAY"));
      setProviderName(row.provider_name ?? (deliveryMode ? "Delivery Partner" : "Provider"));
      setProviderAvatar(row.provider_avatar ?? "");
      setStopsBefore(row.stops_before ?? null);
      setDestLat(row.dest_lat ?? null);
      setDestLng(row.dest_lng ?? null);
      setStoreLat(row.store_lat ?? null);
      setStoreLng(row.store_lng ?? null);
      setStoreName(row.store_name ?? null);
      setAgentHeading(row.agent_heading ?? null);
      setEtaMinutes(row.eta_minutes ?? null);
      setLoading(false);
    } catch (err: unknown) {
      setNetError((err as Error)?.message || "Failed to load tracking data. Please try again.");
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time speed and ETA smoothing
  useEffect(() => {
    if (providerLat === null || providerLng === null) return;

    const now = Date.now();
    if (prevPos.current) {
      const elapsedH = (now - prevPos.current.at) / 3_600_000;
      const movedKm = haversineKm(prevPos.current.lat, prevPos.current.lng, providerLat, providerLng);
      if (elapsedH > 0 && movedKm > 0.01) {
        const instantSpeed = movedKm / elapsedH;
        speedKmh.current = speedKmh.current * 0.7 + Math.min(instantSpeed, 50) * 0.3;
      }
    }
    prevPos.current = { lat: providerLat, lng: providerLng, at: now };

    if (liveStatus === "DONE" || liveStatus === "DELIVERED") {
      setEta("Order Delivered");
    } else if (liveStatus === "ARRIVED") {
      setEta("Arrived at Doorstep");
    } else if (etaMinutes != null) {
      setEta(etaMinutes <= 1 ? "Arriving now" : `~${etaMinutes} min away`);
    } else if (destLat != null && destLng != null) {
      const remainingKm = haversineKm(providerLat, providerLng, destLat, destLng);
      const minutes = Math.max(1, Math.round((remainingKm / Math.max(5, speedKmh.current)) * 60));
      setEta(remainingKm < 0.15 ? "Arriving now" : `~${minutes} min away`);
    } else {
      setEta("On the way");
    }
  }, [providerLat, providerLng, liveStatus, destLat, destLng, etaMinutes]);

  const finished = liveStatus === "DONE" || liveStatus === "DELIVERED" || liveStatus === "CANCELLED";

  // Realtime WebSocket broadcast subscription (<200ms coordinates)
  useEffect(() => {
    if (!agreementId || finished) return;
    const ch = anonSb
      .channel(`delivery_track:${agreementId}`)
      .on("broadcast", { event: "pos" }, (msg: any) => {
        if (msg?.payload?.lat != null && msg?.payload?.lng != null) {
          setProviderLat(msg.payload.lat);
          setProviderLng(msg.payload.lng);
          if (msg.payload.heading != null) setAgentHeading(msg.payload.heading);
        }
      })
      .subscribe();

    return () => {
      void anonSb.removeChannel(ch);
    };
  }, [agreementId, finished]);

  // Live polling (fast 6-second ticks for active tracking fallback)
  useEffect(() => {
    if (!agreementId || !token || finished) return;
    const poll = setInterval(async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      let row: any;
      try {
        const { data } = await anonSb.rpc("get_tracking", { p_token: token });
        row = Array.isArray(data) ? data[0] : data;
      } catch {
        return; // offline: keep current state and retry next tick
      }
      if (!row) return;
      if (row.provider_lat != null) setProviderLat(row.provider_lat);
      if (row.provider_lng != null) setProviderLng(row.provider_lng);
      if (row.agent_heading != null) setAgentHeading(row.agent_heading);
      if (row.eta_minutes != null) setEtaMinutes(row.eta_minutes);
      if (row.store_lat != null) setStoreLat(row.store_lat);
      if (row.store_lng != null) setStoreLng(row.store_lng);
      if (row.dest_lat != null) setDestLat(row.dest_lat);
      if (row.dest_lng != null) setDestLng(row.dest_lng);
      if (row.live_status) {
        setLiveStatus(row.live_status);
      } else if (row.stops_before !== null && row.stops_before !== undefined) {
        setLiveStatus("ASSIGNED");
      }
      if (row.stops_before != null) setStopsBefore(row.stops_before);
    }, 6000);
    return () => clearInterval(poll);
  }, [agreementId, token, finished]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "var(--brand-700)", fontWeight: 700, fontSize: 18 }}>{t("loading")}</div>
      </div>
    );
  }

  if (invalidLink) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Invalid tracking link</div>
        <div style={{ color: "var(--ink-500)", fontSize: 14, maxWidth: 300 }}>
          This link doesn't contain a valid tracking token. Please ask the sender to share the full link.
        </div>
      </div>
    );
  }

  if (netError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>📡</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Connection failed</div>
        <div style={{ color: "var(--ink-500)", fontSize: 14, maxWidth: 300 }}>{netError}</div>
        <button
          className="btn btn-primary btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => void loadData()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (expired) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🔗</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{t("dlv_pub_expired_title")}</div>
        <div style={{ color: "var(--ink-500)", fontSize: 14, maxWidth: 300 }}>{t("dlv_pub_expired_text")}</div>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[liveStatus] ?? { emoji: "📍", key: "" };
  const statusLabel = statusInfo.key ? t(statusInfo.key) : liveStatus;

  // Delivery Stage calculations
  const ds = liveStatusToDeliveryStatus(liveStatus);
  const stage = ds === "DELIVERED" ? "delivered" : ds === "EN_ROUTE" || ds === "ARRIVED" ? "on_the_way" : "assigned";
  const copy = stageCopy(stage, ds === "ARRIVED");
  const delivered = stage === "delivered";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--surface)" }}>
      {/* Top Header Bar */}
      <div style={{ minHeight: 52, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(0px + var(--safe-area-top)) 16px 0", borderBottom: "1px solid var(--line)", flexShrink: 0, zIndex: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="24" height="24" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="var(--brand-600)"/>
            <path d="M32 13 C23 13 16 20 16 28.8 C16 39.5 32 52 32 52 C32 52 48 39.5 48 28.8 C48 20 41 13 32 13 Z" fill="white"/>
            <path d="M32 39 C25 34 39 24 32 19" stroke="var(--brand-600)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--brand-700)", letterSpacing: 0.5 }}>STRYT</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {eta && (
            <span style={{ background: "color-mix(in srgb, var(--brand-500) 12%, transparent)", color: "var(--brand-700)", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>
              {eta}
            </span>
          )}
          <span style={{ background: liveStatus === "CANCELLED" ? "var(--red-100)" : "var(--green-100)", color: liveStatus === "CANCELLED" ? "var(--red-600)" : "var(--green-600)", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20 }}>
            {statusInfo.emoji} {statusLabel}
          </span>
        </div>
      </div>

      {/* Main Interactive Live Map */}
      <div style={{ flex: 1, position: "relative" }}>
        <DeliveryLiveMap
          riderLat={providerLat}
          riderLng={providerLng}
          riderHeading={agentHeading}
          riderName={providerName}
          storeLat={storeLat}
          storeLng={storeLng}
          storeName={storeName}
          destLat={destLat}
          destLng={destLng}
          destAddress="Delivery Address"
          status={liveStatus}
          etaMinutes={etaMinutes}
          bottomSheetOffsetPx={200}
          interactive={true}
        />
      </div>

      {/* Bottom Tracking Card Drawer */}
      <div style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "14px 16px", flexShrink: 0, boxShadow: "0 -4px 16px rgba(0,0,0,0.06)", zIndex: 10 }}>
        {/* Rider profile info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <SafeImg src={providerAvatar} variant="avatar" style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-900)" }} className="ellipsis">
              {providerName || t("trk_rider_title") || "Delivery Partner"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
              {stopsBefore != null && stopsBefore > 0
                ? (stopsBefore === 1 ? t("dlv_trk_ahead_one") : tf("dlv_trk_ahead", { n: stopsBefore }))
                : finished ? (t("dlv_pub_done") || "Delivered") : t("dlv_pub_updates")}
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-700)" }}>
            {eta}
          </span>
        </div>

        {/* Stepper Progress */}
        {liveStatus === "CANCELLED" ? (
          <div style={{ textAlign: "center", color: "var(--red-600)", fontSize: 13, fontWeight: 600, padding: "8px 0" }}>
            {t("dlv_pub_cancelled_text")}
          </div>
        ) : (
          <div className="col gap-10">
            <JourneyRoad fraction={journeyFraction(stage, ds === "ARRIVED", etaMinutes, null)} delivered={delivered} label={t(copy.headlineKey)} />
            <JourneySteps here={milestoneIndex(ORDER_STAGES.indexOf(stage))} delivered={delivered} />
          </div>
        )}
      </div>

      {/* Subtle Footer */}
      <div style={{ height: 32, background: "var(--surface)", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px", flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{t("dlv_pub_powered")}</span>
      </div>
    </div>
  );
}
