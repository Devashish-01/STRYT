import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
      const { data: tt } = await anonSb
        .from("tracking_tokens").select("*").eq("id", token).maybeSingle();
      if (!tt || new Date(tt.expires_at) < new Date()) { setExpired(true); setLoading(false); return; }
      setAgreementId(tt.agreement_id);

      const { data: ag } = await anonSb
        .from("agreements")
        .select("provider_lat, provider_lng, live_status, responder_user_id")
        .eq("id", tt.agreement_id).maybeSingle();
      if (ag) {
        setProviderLat(ag.provider_lat ?? null);
        setProviderLng(ag.provider_lng ?? null);
        setLiveStatus(ag.live_status ?? "ON_THE_WAY");

        const { data: u } = await anonSb.from("users")
          .select("name, avatar").eq("id", ag.responder_user_id).maybeSingle();
        if (u) { setProviderName((u as any).name ?? "Provider"); setProviderAvatar((u as any).avatar ?? ""); }
      }
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

  // Realtime subscription
  useEffect(() => {
    if (!agreementId) return;
    const channel = anonSb
      .channel(`track-${agreementId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "agreements", filter: `id=eq.${agreementId}` },
        (payload) => {
          const row = payload.new as any;
          if (row.provider_lat) setProviderLat(row.provider_lat);
          if (row.provider_lng) setProviderLng(row.provider_lng);
          if (row.live_status) setLiveStatus(row.live_status);
        }
      )
      .subscribe();
    return () => { void anonSb.removeChannel(channel); };
  }, [agreementId]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "#6b21cc", fontWeight: 700, fontSize: 18 }}>Loading…</div>
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
        <span style={{ fontWeight: 800, fontSize: 18, color: "#6b21cc" }}>naya</span>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>Live tracking</span>
      </div>

      {/* Provider bar */}
      <div style={{ height: 60, background: "#fff", display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        {providerAvatar
          ? <img src={providerAvatar} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e9d5ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#6b21cc" }}>{providerName[0]}</div>
        }
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
        <span style={{ fontSize: 11, color: "#9ca3af" }}>Powered by Naya</span>
      </div>
    </div>
  );
}
