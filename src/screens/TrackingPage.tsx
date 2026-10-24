import { RASTER_TILES } from "@/lib/mapTiles";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SafeImg } from "@/components/common";
import { config } from "@/config";
import { JourneySteps } from "@/components/delivery/JourneySteps";
import { JourneyRoad } from "@/components/delivery/JourneyRoad";
import { ORDER_STAGES } from "@/lib/deliveryStage";
import { journeyFraction, milestoneIndex, stageCopy } from "@/lib/orderJourney";
import { liveStatusToDeliveryStatus } from "@/lib/deliveryStatus";
import { track } from "@/lib/analytics";
import { useI18n } from "@/lib/i18n";

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
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function TrackingPage() {
  const { t, tf } = useI18n();
  const { token } = useParams<{ token: string }>();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [providerName, setProviderName] = useState("");
  const [providerAvatar, setProviderAvatar] = useState("");
  const [providerLat, setProviderLat] = useState<number | null>(null);
  const [providerLng, setProviderLng] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState("ON_THE_WAY");
  const [agreementId, setAgreementId] = useState("");
  const [eta, setEta] = useState("");
  const [stopsBefore, setStopsBefore] = useState<number | null>(null);
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  // Deliveries never carry live coordinates (product decision — customers get
  // progress only, not the agent's location). get_tracking's agreement branch
  // always returns stops_before as a literal SQL null; only the delivery
  // branch computes a real count (possibly 0), so this is a reliable signal
  // for "this token is a delivery, don't bother mounting a map that will stay
  // permanently blank."
  const [isDelivery, setIsDelivery] = useState(false);
  const prevPos = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const speedKmh = useRef(15); // smoothed estimate, seeded with a sane city-riding default

  // Inject pulse CSS
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@keyframes naya-pulse { 0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--green-500) 40%, transparent)} 50%{box-shadow:0 0 0 10px color-mix(in srgb, var(--green-500) 0%, transparent)} }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Initial data load
  useEffect(() => {
    if (!token) return;
    (async () => {
      // Read via the get_tracking() RPC, not the agreements table directly.
      // The RPC returns only the safe live-location fields for a valid,
      // non-expired token, so the agreements table stays locked to participants
      // (see supabase/legacy/migration_launch_hardening.sql).
      const { data, error } = await anonSb.rpc("get_tracking", { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      // A tracking link is the one STRYT URL that routinely travels through
      // WhatsApp and comes back. Whether it still resolves is the signal;
      // the token itself is never sent.
      track("share_link_opened", { kind: "tracking", valid: !error && !!row });
      if (error || !row) { setExpired(true); setLoading(false); return; }
      setAgreementId(row.agreement_id);
      setProviderLat(row.provider_lat ?? null);
      setProviderLng(row.provider_lng ?? null);
      const deliveryMode = row.stops_before !== null && row.stops_before !== undefined;
      setIsDelivery(deliveryMode);
      setLiveStatus(row.live_status ?? (deliveryMode ? "ASSIGNED" : "ON_THE_WAY"));
      setProviderName(row.provider_name ?? (deliveryMode ? "Delivery agent" : "Provider"));
      setProviderAvatar(row.provider_avatar ?? "");
      setStopsBefore(row.stops_before ?? null);
      setDestLat(row.dest_lat ?? null);
      setDestLng(row.dest_lng ?? null);
      setLoading(false);
    })();
  }, [token]);

  // Init Leaflet map — skipped entirely for deliveries, which never carry
  // coordinates, so a map here would just stay permanently blank.
  useEffect(() => {
    if (loading || expired || isDelivery || !mapRef.current || leafletMap.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([20.5937, 78.9629], 14);
    L.tileLayer(RASTER_TILES.url, {
      attribution: RASTER_TILES.attribution, maxZoom: RASTER_TILES.maxZoom,
      tileSize: RASTER_TILES.tileSize, zoomOffset: RASTER_TILES.zoomOffset,
    }).addTo(map);
    leafletMap.current = map;
  }, [loading, expired, isDelivery]);

  // Update marker when position changes
  useEffect(() => {
    if (!leafletMap.current || providerLat === null || providerLng === null) return;
    const icon = L.divIcon({
      html: `<div style="width:18px;height:18px;border-radius:50%;background:var(--green-500);border:3px solid var(--white);box-shadow:0 0 0 6px color-mix(in srgb, var(--green-500) 25%, transparent);animation:naya-pulse 1.5s ease-in-out infinite"></div>`,
      className: "",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    if (markerRef.current) {
      markerRef.current.setLatLng([providerLat, providerLng]);
    } else {
      markerRef.current = L.marker([providerLat, providerLng], { icon }).addTo(leafletMap.current);
    }
    leafletMap.current.setView([providerLat, providerLng], 15);

    // Real ETA: distance to the actual destination (when known) over a speed
    // estimate smoothed from consecutive fixes — previously this always showed
    // a hardcoded "~8 min away" regardless of where the agent actually was.
    const now = Date.now();
    if (prevPos.current) {
      const elapsedH = (now - prevPos.current.at) / 3_600_000;
      const movedKm = haversineKm(prevPos.current.lat, prevPos.current.lng, providerLat, providerLng);
      if (elapsedH > 0 && movedKm > 0.01) {
        const instantSpeed = movedKm / elapsedH;
        // Exponential smoothing so one noisy GPS jump can't wreck the estimate.
        speedKmh.current = speedKmh.current * 0.7 + Math.min(instantSpeed, 60) * 0.3;
      }
    }
    prevPos.current = { lat: providerLat, lng: providerLng, at: now };

    if (liveStatus === "DONE") {
      setEta("Job complete");
    } else if (liveStatus === "ARRIVED") {
      setEta("Arrived");
    } else if (destLat != null && destLng != null) {
      const remainingKm = haversineKm(providerLat, providerLng, destLat, destLng);
      const minutes = Math.max(1, Math.round((remainingKm / Math.max(5, speedKmh.current)) * 60));
      setEta(remainingKm < 0.1 ? "Arriving now" : `~${minutes} min away`);
    } else {
      setEta("On the way");
    }
  }, [providerLat, providerLng, liveStatus, destLat, destLng]);

  // Live updates: poll the safe RPC. (Realtime on agreements can't be used here
  // because the agreements table is correctly locked to participants, and this
  // page serves logged-out visitors via a share link.)
  const finished = liveStatus === "DONE" || liveStatus === "CANCELLED";
  useEffect(() => {
    if (!agreementId || !token || finished) return;
    const poll = setInterval(async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      let row: any;
      try {
        const { data } = await anonSb.rpc("get_tracking", { p_token: token });
        row = Array.isArray(data) ? data[0] : data;
      } catch {
        return; // offline for a moment: keep what is on screen and try again next tick
      }
      if (!row) return;
      if (row.provider_lat != null) setProviderLat(row.provider_lat);
      if (row.provider_lng != null) setProviderLng(row.provider_lng);
      if (row.live_status) {
        setLiveStatus(row.live_status);
      } else if (row.stops_before !== null && row.stops_before !== undefined) {
        setLiveStatus("ASSIGNED");
      }
      if (row.stops_before != null) setStopsBefore(row.stops_before);
    }, 15000);
    return () => clearInterval(poll);
  }, [agreementId, token, finished]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "var(--brand-700)", fontWeight: 700, fontSize: 18 }}>{t("loading")}</div>
      </div>
    );
  }

  if (expired) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔗</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{t("dlv_pub_expired_title")}</div>
        <div style={{ color: "var(--ink-500)", fontSize: 14 }}>{t("dlv_pub_expired_text")}</div>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[liveStatus] ?? { emoji: "📍", key: "" };
  const statusLabel = statusInfo.key ? t(statusInfo.key) : liveStatus;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ minHeight: 50, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(0px + var(--safe-area-top)) 16px 0", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="22" height="22" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="var(--brand-600)"/>
            <path d="M32 13 C23 13 16 20 16 28.8 C16 39.5 32 52 32 52 C32 52 48 39.5 48 28.8 C48 20 41 13 32 13 Z" fill="white"/>
            <path d="M32 39 C25 34 39 24 32 19" stroke="var(--brand-600)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--brand-700)", letterSpacing: 0.5 }}>STRYT</span>
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-400)" }}>{isDelivery ? t("dlv_pub_progress") : t("dlv_pub_live")}</span>
      </div>

      {/* Provider bar */}
      <div style={{ height: 60, background: "var(--surface)", display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <SafeImg src={providerAvatar} variant="avatar" style={{ width: 40, height: 40 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{providerName} · {statusLabel.toLowerCase()}</div>
          <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
            {stopsBefore != null && stopsBefore > 0
              ? (stopsBefore === 1 ? t("dlv_trk_ahead_one") : tf("dlv_trk_ahead", { n: stopsBefore }))
              : finished ? "" : t("dlv_pub_updates")}
          </div>
        </div>
        <span style={{ background: liveStatus === "CANCELLED" ? "var(--red-100)" : "var(--green-100)", color: liveStatus === "CANCELLED" ? "var(--red-600)" : "var(--green-600)", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20 }}>{statusInfo.emoji} {statusLabel}</span>
      </div>

      {isDelivery ? (
        // Progress only — deliberate, no live location shared with the
        // customer. A map here would just be a permanently blank grey box, so
        // it's replaced with a status stepper instead.
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 32px" }}>
          {liveStatus === "CANCELLED" ? (
            <div style={{ textAlign: "center", color: "var(--red-600)", fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>
              {t("dlv_pub_cancelled_text")}
            </div>
          ) : (
            <>
              {(() => {
                // The link carries only progress — never a location — so the journey is drawn from the stage alone.
                const ds = liveStatusToDeliveryStatus(liveStatus);
                const stage = ds === "DELIVERED" ? "delivered" : ds === "EN_ROUTE" || ds === "ARRIVED" ? "on_the_way" : "assigned";
                const copy = stageCopy(stage, ds === "ARRIVED");
                const delivered = stage === "delivered";
                return (
                  <div style={{ width: "100%", maxWidth: 360 }} className="col gap-14">
                    <div className="col center" style={{ textAlign: "center", gap: 6 }}>
                      <span className="trk-emoji" aria-hidden="true">{copy.emoji}</span>
                      <div className="trk-title" style={{ color: delivered ? "var(--green-700)" : undefined }}>{t(copy.headlineKey)}</div>
                      <div className="trk-sub" style={{ color: delivered ? "var(--green-700)" : undefined }}>{t(copy.subKey)}</div>
                    </div>
                    <JourneyRoad fraction={journeyFraction(stage, ds === "ARRIVED", null, null)} delivered={delivered} label={t(copy.headlineKey)} />
                    <JourneySteps here={milestoneIndex(ORDER_STAGES.indexOf(stage))} delivered={delivered} />
                  </div>
                );
              })()}
              <div style={{ textAlign: "center", color: "var(--ink-500)", fontSize: 12, lineHeight: 1.6 }}>
                {t("dlv_pub_no_location")}
              </div>
            </>
          )}
        </div>
      ) : (
        <div ref={mapRef} style={{ flex: 1 }} />
      )}

      {/* Footer */}
      <div style={{ height: 50, background: "var(--surface)", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
        {isDelivery ? (
          <span style={{ fontSize: 12, color: "var(--ink-400)" }}>{finished ? "" : stopsBefore === 0 ? t("dlv_pub_next_stop") : t("dlv_pub_progress_updates")}</span>
        ) : (
          <span style={{ background: "var(--green-100)", color: "var(--green-600)", fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20 }}>{eta}</span>
        )}
        <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{t("dlv_pub_powered")}</span>
      </div>
    </div>
  );
}
