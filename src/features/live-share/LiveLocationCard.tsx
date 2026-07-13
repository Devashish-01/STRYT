import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { config } from "@/config";
import { emergencyService, type LiveShareView } from "@/services/engagement/emergencyService";
import { MapPin } from "@/components/Icons";

/**
 * The live-location card that appears inside a chat thread. Polls
 * get_live_share() every 15s and animates the sharer's marker on a small map.
 * Flips to a static "sharing ended" state when the session ends. Rendered for
 * both sides — the sharer sees their own moving pin too.
 */
export default function LiveLocationCard({ shareId, endedHint }: { shareId: string; endedHint?: boolean }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [view, setView] = useState<LiveShareView | null>(null);
  const [ended, setEnded] = useState(!!endedHint);

  // Poll the safe RPC.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      const v = await emergencyService.getShare(shareId);
      if (!alive || !v) return;
      setView(v);
      if (v.status === "ENDED") {
        setEnded(true);
        if (timer) clearInterval(timer);
      }
    };
    void tick();
    if (!endedHint) timer = setInterval(tick, 15000);
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [shareId, endedHint]);

  // Init / move the map marker as coords arrive.
  useEffect(() => {
    if (ended || !view || view.lat == null || view.lng == null || !mapEl.current) return;
    if (!mapRef.current) {
      const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false })
        .setView([view.lat, view.lng], 15);
      L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${config.mapboxToken}`,
        { tileSize: 512, zoomOffset: -1 }
      ).addTo(map);
      mapRef.current = map;
    }
    const icon = L.divIcon({
      html: `<div style="width:16px;height:16px;border-radius:50%;background:var(--accent-500);border:3px solid #fff;box-shadow:0 0 0 6px rgba(255,140,60,0.25)"></div>`,
      className: "", iconSize: [16, 16], iconAnchor: [8, 8],
    });
    if (markerRef.current) markerRef.current.setLatLng([view.lat, view.lng]);
    else markerRef.current = L.marker([view.lat, view.lng], { icon }).addTo(mapRef.current);
    mapRef.current.setView([view.lat, view.lng]);
  }, [view, ended]);

  // Tear the map down when the share ends.
  useEffect(() => {
    if (ended && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    }
  }, [ended]);

  const name = view?.sharerName ?? "Someone";
  const updatedLabel = view?.updatedAt
    ? new Date(view.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div style={{
      width: "76%", maxWidth: 280, borderRadius: 16, overflow: "hidden",
      border: "1px solid var(--line)", background: "var(--surface)",
    }}>
      <div className="row gap-8" style={{ alignItems: "center", padding: "9px 12px" }}>
        <MapPin size={15} color={ended ? "var(--ink-400)" : "var(--accent-500)"} />
        <div className="grow" style={{ lineHeight: 1.25 }}>
          <div className="semi" style={{ fontSize: 13.5 }}>
            {ended ? "Live location ended" : `${name}'s live location`}
          </div>
          <div className="tiny muted">
            {ended ? "Sharing has stopped" : updatedLabel ? `Updated ${updatedLabel} · live` : "Locating…"}
          </div>
        </div>
        {!ended && (
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: "var(--accent-500)",
            boxShadow: "0 0 0 0 rgba(255,140,60,0.6)", animation: "livePulseRing 1.6s ease-out infinite",
          }} />
        )}
      </div>
      {!ended && (
        <div ref={mapEl} style={{ height: 150, width: "100%", background: "var(--ink-100)" }} />
      )}
    </div>
  );
}
