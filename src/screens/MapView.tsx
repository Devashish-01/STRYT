import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Navigation, Pencil, Check } from "lucide-react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";
import { discoveryService, requestService, socialService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Rating, inr } from "@/components/common";
import { useApp } from "@/store";
import { config } from "@/config";
import { StoryViewer } from "@/components/Stories";
import type { Story } from "@/types";

type Layer = "business" | "provider" | "request" | "story";

const RADIUS_OPTIONS = [
  { label: "500m", km: 0.5 },
  { label: "1 km",  km: 1 },
  { label: "2 km",  km: 2 },
  { label: "5 km",  km: 5 },
  { label: "10 km", km: 10 },
  { label: "25 km", km: 25 },
  { label: "50 km", km: 50 },
  { label: "100 km", km: 100 },
  { label: "🌍 World", km: 20000 },
] as const;

const pinColors: Record<Exclude<Layer, "story">, string> = {
  business: "#f26a00",
  provider: "#16a34a",
  request:  "#7c3aed",
};

const layerLabels: Record<Layer, string> = {
  business: "Shops",
  provider: "Providers",
  request:  "Requests",
  story:    "Stories",
};

function makeStoryIcon(avatarUrl: string, seen: boolean) {
  const ringStyle = seen
    ? "background:#9ca3af"
    : "background:linear-gradient(135deg,#ff8400,#ec4899,#7c3aed)";
  return L.divIcon({
    className: "",
    html: `<div style="width:44px;height:44px;border-radius:50%;${ringStyle};padding:2.5px;box-shadow:0 2px 10px rgba(0,0,0,0.35)">
      <div style="width:100%;height:100%;border-radius:50%;background:#e5e7eb;overflow:hidden;border:2px solid #fff">
        ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />` : ""}
      </div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -28],
  });
}

const businessIcon = makePinIcon(pinColors.business);
const providerIcon = makePinIcon(pinColors.provider);
const requestIcon  = makePinIcon(pinColors.request);

const meIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#8b47f5;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Flies/zooms the map whenever the radius changes
function RadiusController({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    if (radiusKm >= 5000) {
      map.flyTo([20, 0], 2, { duration: 1.2 });
    } else {
      // toBounds() computes a geographic box from the center point alone — no map
      // attachment needed. (L.circle(...).getBounds() throws because an unadded
      // circle has no _map to project pixels with.) Box side = 2 × radius.
      const bounds = L.latLng(lat, lng).toBounds(radiusKm * 2000);
      map.fitBounds(bounds, { padding: [60, 80], animate: true, duration: 0.8 });
    }
  }, [radiusKm, lat, lng, map]);
  return null;
}

function RecenterButton({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  const map = useMap();
  return (
    <button
      className="icon-btn"
      title="Re-centre"
      style={{ background: "#fff", boxShadow: "var(--shadow)", position: "absolute", top: 70, right: 16, zIndex: 1000 }}
      onClick={() => {
        if (radiusKm >= 5000) { map.flyTo([lat, lng], 5, { duration: 0.8 }); return; }
        const bounds = L.latLng(lat, lng).toBounds(radiusKm * 2000);
        map.fitBounds(bounds, { padding: [60, 80], animate: true, duration: 0.8 });
      }}
    >
      <Navigation size={18} color="#8b47f5" />
    </button>
  );
}

function roundToHalf(v: number): number {
  const r = Math.round(v * 2) / 2;
  return Math.max(0.5, r);
}

export default function MapView() {
  const nav = useNavigate();
  const { user, viewedStories } = useApp();
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    business: true, provider: true, request: true, story: false,
  });
  const [radiusKm, setRadiusKm] = useState(5);
  const [storyViewer, setStoryViewer] = useState<{ stories: Story[]; idx: number } | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const presetKms = new Set<number>(RADIUS_OPTIONS.map((o) => o.km));
  const isCustomActive = !presetKms.has(radiusKm);

  function openCustom() {
    setCustomVal(isCustomActive ? String(radiusKm) : "");
    setShowCustom(true);
    setTimeout(() => customInputRef.current?.focus(), 60);
  }

  function applyCustom() {
    const n = parseFloat(customVal);
    if (!isNaN(n) && n > 0) setRadiusKm(roundToHalf(n));
    setShowCustom(false);
  }

  const centerLat = user.lat || 18.536;
  const centerLng = user.lng || 73.893;
  const isWorld   = radiusKm >= 5000;

  // For "World" use a globally-sorted (newest-first) query with no geo filter
  const { data: bizPage } = useQuery(
    () => isWorld
      ? discoveryService.businesses({ sort: "new" })
      : discoveryService.businesses({ lat: centerLat, lng: centerLng, radius: radiusKm }),
    [centerLat, centerLng, radiusKm]
  );
  const { data: provPage } = useQuery(
    () => isWorld
      ? discoveryService.providers({ sort: "new" })
      : discoveryService.providers({ lat: centerLat, lng: centerLng, radius: radiusKm }),
    [centerLat, centerLng, radiusKm]
  );
  const { data: reqPage } = useQuery(() => requestService.feed(), []);
  const { data: nearbyStories } = useQuery(
    () => layers.story
      ? socialService.storiesNearby(centerLat, centerLng, Math.min(radiusKm, 200))
      : Promise.resolve([]),
    [layers.story, centerLat, centerLng, radiusKm]
  );

  const businesses = bizPage?.data ?? [];
  const providers  = provPage?.data ?? [];
  const requests   = (reqPage?.data ?? []).filter((r) => r.status === "OPEN");
  const mapStories = (nearbyStories ?? []).filter((s) => s.lat && s.lng);

  const visibleCount =
    (layers.business ? businesses.length : 0) +
    (layers.provider ? providers.length : 0) +
    (layers.request  ? requests.filter((r) => r.lat && r.lng).length : 0) +
    (layers.story    ? mapStories.length : 0);

  return (
    <div className="screen" style={{ position: "relative" }}>
      {/* Back button */}
      <header className="appbar" style={{
        background: "transparent", borderBottom: "none",
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
      }}>
        <button
          className="icon-btn"
          style={{ background: "#fff", boxShadow: "var(--shadow)" }}
          onClick={() => nav(-1)}
        >
          <ArrowLeft size={20} />
        </button>
      </header>

      {/* Layer toggles */}
      <div style={{ position: "absolute", top: 70, left: 16, zIndex: 1000 }}>
        <div className="row gap-8" style={{ flexWrap: "wrap", maxWidth: 220 }}>
          {(["business", "provider", "request", "story"] as Layer[]).map((l) => {
            const color = l === "story" ? "#ec4899" : pinColors[l as Exclude<Layer, "story">];
            return (
              <button
                key={l}
                className="chip"
                style={{
                  background: layers[l] ? color : "#fff",
                  color:       layers[l] ? "#fff" : "var(--ink-700)",
                  borderColor: layers[l] ? color : "var(--ink-200)",
                  boxShadow:   "var(--shadow-sm)",
                  fontSize: 12,
                  padding: "4px 10px",
                }}
                onClick={() => setLayers((s) => ({ ...s, [l]: !s[l] }))}
              >
                {layerLabels[l]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Visible-count badge */}
      {visibleCount > 0 && (
        <div style={{
          position: "absolute", bottom: 88, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: "#7c3aed", color: "#fff",
          borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700,
          boxShadow: "0 2px 12px rgba(107,33,204,0.45)", whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          {visibleCount} {visibleCount === 1 ? "place" : "places"}
          {isWorld ? " globally" : isCustomActive ? ` within ${radiusKm} km` : ` within ${RADIUS_OPTIONS.find(o => o.km === radiusKm)?.label}`}
        </div>
      )}

      {/* Custom distance input card */}
      {showCustom && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 1100 }}
            onClick={() => setShowCustom(false)}
          />
          <div style={{
            position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
            zIndex: 1200,
            background: "#fff",
            borderRadius: 20,
            padding: "16px 18px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
            minWidth: 240,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-500)", marginBottom: 10, letterSpacing: 0.4 }}>
              CUSTOM RADIUS
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                ref={customInputRef}
                type="number"
                min={0.5}
                step={0.5}
                value={customVal}
                placeholder="e.g. 3.7"
                onChange={(e) => setCustomVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); if (e.key === "Escape") setShowCustom(false); }}
                style={{
                  flex: 1,
                  border: "1.5px solid var(--ink-200)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--ink-900)",
                  outline: "none",
                  width: 0,
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-500)", flexShrink: 0 }}>km</span>
              <button
                onClick={applyCustom}
                style={{
                  width: 42, height: 42, borderRadius: 13,
                  background: "#7c3aed", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer", flexShrink: 0,
                }}
              >
                <Check size={20} strokeWidth={2.8} />
              </button>
            </div>
            {customVal && !isNaN(parseFloat(customVal)) && parseFloat(customVal) > 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 8 }}>
                Snaps to <strong style={{ color: "#7c3aed" }}>{roundToHalf(parseFloat(customVal))} km</strong>
              </div>
            )}
          </div>
        </>
      )}

      {/* Radius selector strip */}
      <div style={{
        position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
        zIndex: 1000,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(14px)",
        borderRadius: 30,
        padding: "6px 10px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        display: "flex", gap: 2,
        maxWidth: "calc(100% - 32px)",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {RADIUS_OPTIONS.map((opt) => {
          const active = radiusKm === opt.km;
          return (
            <button
              key={opt.km}
              onClick={() => { setRadiusKm(opt.km); setShowCustom(false); }}
              style={{
                padding: "6px 13px",
                borderRadius: 22,
                border: "none",
                background: active ? "#7c3aed" : "transparent",
                color: active ? "#fff" : "var(--ink-600)",
                fontWeight: active ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {opt.label}
            </button>
          );
        })}

        {/* Custom button */}
        <button
          onClick={openCustom}
          style={{
            padding: "6px 13px",
            borderRadius: 22,
            border: "none",
            background: isCustomActive ? "#7c3aed" : "transparent",
            color: isCustomActive ? "#fff" : "var(--ink-600)",
            fontWeight: isCustomActive ? 700 : 500,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
            display: "flex", alignItems: "center", gap: 5,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          <Pencil size={12} strokeWidth={2.5} />
          {isCustomActive ? `${radiusKm} km` : "Custom"}
        </button>
      </div>

      {/* Full-screen map */}
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={13}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.mapbox.com/">Mapbox</a>'
          url={`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/256/{z}/{x}/{y}?access_token=${config.mapboxToken}`}
        />

        <RadiusController lat={centerLat} lng={centerLng} radiusKm={radiusKm} />
        <RecenterButton   lat={centerLat} lng={centerLng} radiusKm={radiusKm} />

        {/* User dot */}
        <Marker position={[centerLat, centerLng]} icon={meIcon} />

        {/* Radius ring — hidden for World mode */}
        {!isWorld && (
          <Circle
            center={[centerLat, centerLng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: "#7c3aed", weight: 1.5,
              dashArray: "6 5",
              fillColor: "#7c3aed", fillOpacity: 0.05,
            }}
          />
        )}

        {/* Businesses */}
        {layers.business && businesses.filter((b) => b.lat && b.lng).map((b) => (
          <Marker key={b.id} position={[b.lat, b.lng]} icon={businessIcon}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <strong>{b.name}</strong>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{b.subCategory}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Rating value={b.ratingAvg} size={11} />
                  {b.distanceKm != null && <span style={{ fontSize: 12, color: "#888" }}>{b.distanceKm} km</span>}
                </div>
                <button
                  onClick={() => nav(`/business/${b.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: pinColors.business, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  View shop
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Providers */}
        {layers.provider && providers.filter((p) => p.lat && p.lng).map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={providerIcon}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <strong>{p.displayName}</strong>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{p.categoryName} · from {inr(p.startingPrice)}</div>
                <div style={{ marginTop: 4 }}><Rating value={p.ratingAvg} size={11} /></div>
                <button
                  onClick={() => nav(`/provider/${p.id}`)}
                  style={{ marginTop: 8, padding: "6px 12px", background: pinColors.provider, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                >
                  View profile
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Requests */}
        {layers.request && requests.filter((r) => r.lat && r.lng).map((r) => {
          const lat = r.lat as number;
          const lng = r.lng as number;
          return (
            <Marker key={r.id} position={[lat, lng]} icon={requestIcon}>
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <span style={{ fontSize: 11, background: "#e9d5ff", color: "#7c3aed", padding: "2px 6px", borderRadius: 4 }}>{r.categoryName}</span>
                  <div style={{ fontWeight: 700, marginTop: 4, fontSize: 14 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : "Open budget"}
                  </div>
                  <button
                    onClick={() => nav(`/request/${r.id}`)}
                    style={{ marginTop: 8, padding: "6px 12px", background: pinColors.request, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                  >
                    View request
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Stories — avatar bubbles */}
        {layers.story && mapStories.map((s, i) => {
          const seen = viewedStories.includes(s.id);
          return (
            <Marker
              key={s.id}
              position={[s.lat!, s.lng!]}
              icon={makeStoryIcon(s.authorAvatar, seen)}
              eventHandlers={{ click: () => setStoryViewer({ stories: mapStories, idx: i }) }}
            >
              <Popup>
                <div style={{ minWidth: 160, textAlign: "center" }}>
                  <strong style={{ fontSize: 13 }}>{s.authorName.split(" ")[0]}</strong>
                  {s.caption && <p style={{ fontSize: 12, color: "#555", marginTop: 4, lineHeight: 1.4 }}>{s.caption}</p>}
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{s.postedAt} · {s.expiresInHrs}h left</div>
                  <button
                    onClick={() => setStoryViewer({ stories: mapStories, idx: i })}
                    style={{ marginTop: 8, padding: "6px 12px", background: "linear-gradient(135deg,#ff8400,#ec4899)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%" }}
                  >
                    View story
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {storyViewer && (
        <StoryViewer
          stories={storyViewer.stories}
          startIndex={storyViewer.idx}
          onClose={() => setStoryViewer(null)}
        />
      )}
    </div>
  );
}
