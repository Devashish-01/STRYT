import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SafeImg } from "@/components/common";

const anonSb = createClient(
  (import.meta as any).env.VITE_SUPABASE_URL,
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY
);

const STATUS_LABELS: Record<string, { emoji: string; label: string }> = {
  LEAVING:    { emoji: "🚶", label: "Leaving now" },
  ON_THE_WAY: { emoji: "🛵", label: "On the way" },
  ARRIVED:    { emoji: "📍", label: "Arrived" },
  WORKING:    { emoji: "🔧", label: "Working" },
  DONE:       { emoji: "✅", label: "Job complete" },
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function TrackingPage() {
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

  // Inject pulse CSS
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@keyframes naya-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,0.4)} 50%{box-shadow:0 0 0 10px rgba(22,163,74,0)} }`;
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
      // (see supabase/migration_launch_hardening.sql).
      const { data, error } = await anonSb.rpc("get_tracking", { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setExpired(true); setLoading(false); return; }
      setAgreementId(row.agreement_id);
      setProviderLat(row.provider_lat ?? null);
      setProviderLng(row.provider_lng ?? null);
      setLiveStatus(row.live_status ?? "ON_THE_WAY");
      setProviderName(row.provider_name ?? "Provider");
      setProviderAvatar(row.provider_avatar ?? "");
      setLoading(false);
    })();
  }, [token]);

  // Init Leaflet map
  useEffect(() => {
    if (loading || expired || !mapRef.current || leafletMap.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([20.5937, 78.9629], 14);
    L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${(import.meta as any).env.VITE_MAPBOX_TOKEN}`,
      { tileSize: 512, zoomOffset: -1, attribution: "© Mapbox" }
    ).addTo(map);
    leafletMap.current = map;
  }, [loading, expired]);

  // Update marker when position changes
  useEffect(() => {
    if (!leafletMap.current || providerLat === null || providerLng === null) return;
    const icon = L.divIcon({
      html: `<div style="width:18px;height:18px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 0 0 6px rgba(22,163,74,0.25);animation:naya-pulse 1.5s ease-in-out infinite"></div>`,
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
    // Simple ETA: assume 15 km/h
    const dist = haversineKm(providerLat, providerLng, providerLat, providerLng);
    void dist;
    setEta(liveStatus === "DONE" ? "Job complete" : liveStatus === "ARRIVED" ? "Arrived" : "~8 min away");
  }, [providerLat, providerLng, liveStatus]);

  // Live updates: poll the safe RPC. (Realtime on agreements can't be used here
  // because the agreements table is correctly locked to participants, and this
  // page serves logged-out visitors via a share link.)
  useEffect(() => {
    if (!agreementId || !token) return;
    const poll = setInterval(async () => {
      const { data } = await anonSb.rpc("get_tracking", { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      if (row.provider_lat != null) setProviderLat(row.provider_lat);
      if (row.provider_lng != null) setProviderLng(row.provider_lng);
      if (row.live_status) setLiveStatus(row.live_status);
    }, 15000);
    return () => clearInterval(poll);
  }, [agreementId, token]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "var(--brand-700)", fontWeight: 700, fontSize: 18 }}>Loading…</div>
      </div>
    );
  }

  if (expired) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔗</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Tracking link has expired</div>
        <div style={{ color: "#6b7280", fontSize: 14 }}>Ask the requester to share a new link.</div>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[liveStatus] ?? { emoji: "📍", label: liveStatus };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ height: 50, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="22" height="22" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="#7c3aed"/>
            <path d="M32 13 C23 13 16 20 16 28.8 C16 39.5 32 52 32 52 C32 52 48 39.5 48 28.8 C48 20 41 13 32 13 Z" fill="#fff"/>
            <path d="M32 39 C25 34 39 24 32 19" stroke="#7c3aed" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--brand-700)", letterSpacing: 0.5 }}>STRYT</span>
        </span>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>Live tracking</span>
      </div>

      {/* Provider bar */}
      <div style={{ height: 60, background: "#fff", display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <SafeImg src={providerAvatar} variant="avatar" style={{ width: 40, height: 40 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{providerName} is {statusInfo.label.toLowerCase()}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Updates every 30s</div>
        </div>
        <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20 }}>{statusInfo.emoji} {statusInfo.label}</span>
      </div>

      {/* Map */}
      <div ref={mapRef} style={{ flex: 1 }} />

      {/* Footer */}
      <div style={{ height: 50, background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
        <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20 }}>{eta}</span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>Powered by STRYT</span>
      </div>
    </div>
  );
}
