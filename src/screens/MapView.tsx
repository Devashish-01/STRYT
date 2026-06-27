import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Navigation, Pencil, Check, Search, X, ChevronRight } from "lucide-react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from "react-leaflet";
import { makePinIcon } from "@/lib/leafletIcon";
import "@/lib/leafletIcon";
import { discoveryService, requestService, socialService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Rating, inr } from "@/components/common";
import { useApp } from "@/store";
import { forwardGeocode, reverseGeocode, type GeoPlace } from "@/lib/geocode";
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

function RecenterButton({ radiusKm }: { radiusKm: number }) {
  const map = useMap();
  const { user, refreshUser, showToast } = useApp();
  const lat = user.lat || 18.536;
  const lng = user.lng || 73.893;

  const recenterMap = (targetLat: number, targetLng: number) => {
    if (radiusKm >= 5000) {
      map.flyTo([targetLat, targetLng], 5, { duration: 0.8 });
    } else {
      const bounds = L.latLng(targetLat, targetLng).toBounds(radiusKm * 2000);
      map.fitBounds(bounds, { padding: [60, 80], animate: true, duration: 0.8 });
    }
  };

  return (
    <button
      className="icon-btn"
      title="Re-centre"
      style={{ background: "#fff", boxShadow: "var(--shadow)", position: "absolute", bottom: 80, right: 16, zIndex: 1000 }}
      onClick={() => {
        if (!navigator.geolocation) {
          showToast("GPS geolocation not supported on this device.");
          recenterMap(lat, lng);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
              const areaName = await reverseGeocode(latitude, longitude);
              await userService.setLocation(latitude, longitude, areaName || "Current Location");
              await refreshUser();
              showToast(`Location set to GPS — ${areaName || "Current Location"}`);
              recenterMap(latitude, longitude);
            } catch (err) {
              showToast("Couldn't update saved location to GPS.");
              recenterMap(latitude, longitude);
            }
          },
          (error) => {
            showToast("GPS unavailable. Centering on last saved location.");
            recenterMap(lat, lng);
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }}
    >
      <Navigation size={18} color="#8b47f5" />
    </button>
  );
}

function MapEventsController() {
  const { refreshUser, showToast } = useApp();
  const map = useMap();
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const startPress = (latlng: L.LatLng) => {
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = setTimeout(async () => {
        const { lat, lng } = latlng;
        try {
          const areaName = (await reverseGeocode(lat, lng)) || "Custom Pin";
          await userService.setLocation(lat, lng, areaName);
          await refreshUser();
          showToast(`Location set via long press — ${areaName}`);
        } catch {
          showToast("Couldn't set location");
        }
      }, 600);
    };

    const cancelPress = () => {
      if (pressTimeoutRef.current) {
        clearTimeout(pressTimeoutRef.current);
        pressTimeoutRef.current = null;
      }
    };

    const onMouseDown = (e: any) => startPress(e.latlng);
    const onMouseUp = () => cancelPress();
    const onTouchStart = (e: any) => {
      if (e.latlng) startPress(e.latlng);
    };
    const onTouchEnd = () => cancelPress();
    const onTouchMove = () => cancelPress();
    const onDragStart = () => cancelPress();
    const onZoomStart = () => cancelPress();
    const onContextMenu = async (e: any) => {
      cancelPress();
      const { lat, lng } = e.latlng;
      try {
        const areaName = (await reverseGeocode(lat, lng)) || "Custom Pin";
        await userService.setLocation(lat, lng, areaName);
        await refreshUser();
        showToast(`Location set via context menu — ${areaName}`);
      } catch {
        showToast("Couldn't set location");
      }
    };

    map.on("mousedown", onMouseDown);
    map.on("mouseup", onMouseUp);
    map.on("touchstart", onTouchStart as any);
    map.on("touchend", onTouchEnd as any);
    map.on("touchmove", onTouchMove as any);
    map.on("dragstart", onDragStart);
    map.on("zoomstart", onZoomStart);
    map.on("contextmenu", onContextMenu);

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mouseup", onMouseUp);
      map.off("touchstart", onTouchStart as any);
      map.off("touchend", onTouchEnd as any);
      map.off("touchmove", onTouchMove as any);
      map.off("dragstart", onDragStart);
      map.off("zoomstart", onZoomStart);
      map.off("contextmenu", onContextMenu);
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    };
  }, [map, refreshUser, showToast]);

  return null;
}

function roundToHalf(v: number): number {
  const r = Math.round(v * 2) / 2;
  return Math.max(0.5, r);
}

export default function MapView() {
  const nav = useNavigate();
  const { user, viewedStories, refreshUser, showToast } = useApp();
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    business: true, provider: true, request: true, story: false,
  });
  const [radiusKm, setRadiusKm] = useState(5);
  const [storyViewer, setStoryViewer] = useState<{ stories: Story[]; idx: number } | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const [showNearbyPopup, setShowNearbyPopup] = useState(false);
  const [activeTab, setActiveTab] = useState<"business" | "provider" | "story">("business");

  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);

  async function searchPlaces(q: string) {
    setLocQuery(q);
    if (q.trim().length < 2) { setLocResults([]); return; }
    setSearching(true);
    try {
      setLocResults(await forwardGeocode(q));
    } finally {
      setSearching(false);
    }
  }

  async function pickPlace(p: GeoPlace) {
    try {
      await userService.setLocation(p.lat, p.lng, p.area);
      await refreshUser();
      setLocQuery("");
      setLocResults([]);
      showToast(`Location set — ${p.area}`);
    } catch {
      showToast("Couldn't set that location");
    }
  }

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
      {/* Top search & back panel */}
      <div style={{
        position: "absolute", top: 12, left: 16, right: 16, zIndex: 1000,
        display: "flex", gap: 10, alignItems: "center"
      }}>
        <button
          className="icon-btn"
          style={{ background: "#fff", boxShadow: "var(--shadow)", flexShrink: 0 }}
          onClick={() => nav(-1)}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={16} color="var(--ink-400)" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="text"
            className="input"
            value={locQuery}
            placeholder="Search location remotely..."
            onChange={(e) => searchPlaces(e.target.value)}
            style={{
              width: "100%",
              background: "#fff",
              boxShadow: "var(--shadow)",
              border: "1.5px solid var(--ink-200)",
              borderRadius: 30,
              padding: "10px 18px",
              paddingLeft: "42px",
              paddingRight: locQuery ? "35px" : "18px",
              fontSize: 14,
              fontWeight: 500,
              outline: "none"
            }}
          />
          {locQuery && (
            <button
              onClick={() => { setLocQuery(""); setLocResults([]); }}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                border: "none", background: "transparent", color: "var(--ink-400)", cursor: "pointer",
                fontSize: 18, fontWeight: 700
              }}
            >
              &times;
            </button>
          )}

          {locResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8,
              background: "#fff", borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              border: "1px solid var(--ink-200)", overflow: "hidden", zIndex: 1010
            }}>
              {locResults.map((r, idx) => (
                <button
                  key={idx}
                  onClick={() => pickPlace(r)}
                  style={{
                    width: "100%", padding: "12px 16px", border: "none", background: "none",
                    textAlign: "left", fontSize: 13, color: "var(--ink-800)", borderBottom: idx < locResults.length - 1 ? "1px solid var(--ink-100)" : "none",
                    cursor: "pointer", display: "block"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--ink-50)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>{r.area}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.full}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Layer toggles */}
      <div style={{ position: "absolute", top: 74, left: 16, zIndex: 1000 }}>
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

      {/* Visible-count badge (clickable button) */}
      {visibleCount > 0 && (
        <button
          onClick={() => setShowNearbyPopup(true)}
          style={{
            position: "absolute", bottom: 88, left: "50%", transform: "translateX(-50%)",
            zIndex: 1000, background: "#7c3aed", color: "#fff",
            borderRadius: 20, padding: "8px 16px", fontSize: 12, fontWeight: 700,
            boxShadow: "0 4px 16px rgba(107,33,204,0.35)", whiteSpace: "nowrap",
            border: "none", outline: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            transition: "all 0.2s ease-in-out",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#6d28d9"}
          onMouseLeave={(e) => e.currentTarget.style.background = "#7c3aed"}
        >
          <span>
            {visibleCount} {visibleCount === 1 ? "place" : "places"}
            {isWorld ? " globally" : isCustomActive ? ` within ${radiusKm} km` : ` within ${RADIUS_OPTIONS.find(o => o.km === radiusKm)?.label}`}
          </span>
          <ChevronRight size={14} style={{ opacity: 0.8 }} />
        </button>
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
        <RecenterButton   radiusKm={radiusKm} />
        <MapEventsController />

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
              interactive: false,
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

      {showNearbyPopup && (
        <div className="overlay" onClick={() => setShowNearbyPopup(false)} style={{ zIndex: 1100 }}>
          <div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              borderRadius: "24px 24px 0 0",
              background: "#fff",
              paddingBottom: 24,
            }}
          >
            <div className="sheet-grab" />
            
            {/* Header */}
            <div className="row between" style={{ marginBottom: 16 }}>
              <div>
                <h3 className="bold" style={{ fontSize: 18 }}>Nearby on your Street</h3>
                <span className="tiny muted">
                  Showing {visibleCount} {visibleCount === 1 ? "item" : "items"}{isWorld ? " globally" : ` within ${radiusKm} km`}
                </span>
              </div>
              <button
                onClick={() => setShowNearbyPopup(false)}
                style={{
                  background: "var(--ink-100)",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--ink-700)"
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab switchers */}
            <div className="row gap-8" style={{ marginBottom: 16, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <button
                onClick={() => setActiveTab("business")}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "business" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
                  color: activeTab === "business" ? "var(--brand-700)" : "var(--ink-500)",
                  fontWeight: activeTab === "business" ? 700 : 500,
                  padding: "8px 12px",
                  fontSize: 14,
                  cursor: "pointer",
                  flex: 1,
                  textAlign: "center"
                }}
              >
                Shops ({businesses.length})
              </button>
              <button
                onClick={() => setActiveTab("provider")}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "provider" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
                  color: activeTab === "provider" ? "var(--brand-700)" : "var(--ink-500)",
                  fontWeight: activeTab === "provider" ? 700 : 500,
                  padding: "8px 12px",
                  fontSize: 14,
                  cursor: "pointer",
                  flex: 1,
                  textAlign: "center"
                }}
              >
                Providers ({providers.length})
              </button>
              <button
                onClick={() => setActiveTab("story")}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "story" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
                  color: activeTab === "story" ? "var(--brand-700)" : "var(--ink-500)",
                  fontWeight: activeTab === "story" ? 700 : 500,
                  padding: "8px 12px",
                  fontSize: 14,
                  cursor: "pointer",
                  flex: 1,
                  textAlign: "center"
                }}
              >
                Stories ({mapStories.length})
              </button>
            </div>

            {/* Scrollable contents */}
            <div className="grow col" style={{ overflowY: "auto", maxHeight: "50vh", paddingRight: 4 }}>
              {activeTab === "business" && (
                <div className="col gap-8">
                  {businesses.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-400)" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🏬</div>
                      <div className="semi small">No shops found in this radius</div>
                    </div>
                  ) : (
                    businesses.map((b) => (
                      <div
                        key={b.id}
                        className="card row gap-12"
                        style={{ padding: 12, cursor: "pointer", border: "1px solid var(--line)" }}
                        onClick={() => { nav(`/business/${b.id}`); setShowNearbyPopup(false); }}
                      >
                        <div style={{
                          width: 48, height: 48, borderRadius: 12,
                          background: `${pinColors.business}12`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 22, flexShrink: 0
                        }}>
                          🏬
                        </div>
                        <div className="grow">
                          <div className="bold small" style={{ color: "var(--ink-900)" }}>{b.name}</div>
                          <div className="tiny muted">{b.subCategory}</div>
                          <div className="row gap-8" style={{ marginTop: 4 }}>
                            <Rating value={b.ratingAvg} size={10} />
                            {b.distanceKm != null && (
                              <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
                                • {b.distanceKm} km
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={16} className="muted" />
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "provider" && (
                <div className="col gap-8">
                  {providers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-400)" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🛠️</div>
                      <div className="semi small">No providers found in this radius</div>
                    </div>
                  ) : (
                    providers.map((p) => (
                      <div
                        key={p.id}
                        className="card row gap-12"
                        style={{ padding: 12, cursor: "pointer", border: "1px solid var(--line)" }}
                        onClick={() => { nav(`/provider/${p.id}`); setShowNearbyPopup(false); }}
                      >
                        <img
                          src={p.avatar || "https://images.unsplash.com/photo-1521791136364-7286472b6b5c?w=100"}
                          style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
                        />
                        <div className="grow">
                          <div className="bold small" style={{ color: "var(--ink-900)" }}>{p.displayName}</div>
                          <div className="tiny muted">{p.categoryName} · starting {inr(p.startingPrice)}</div>
                          <div style={{ marginTop: 4 }}><Rating value={p.ratingAvg} size={10} /></div>
                        </div>
                        <ChevronRight size={16} className="muted" />
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "story" && (
                <div className="col gap-8">
                  {mapStories.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-400)" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                      <div className="semi small">No stories found in this radius</div>
                    </div>
                  ) : (
                    mapStories.map((s, idx) => {
                      const seen = viewedStories.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          className="card row gap-12"
                          style={{ padding: 12, cursor: "pointer", border: "1px solid var(--line)" }}
                          onClick={() => {
                            setStoryViewer({ stories: mapStories, idx });
                            setShowNearbyPopup(false);
                          }}
                        >
                          <img
                            src={s.authorAvatar || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100"}
                            style={{
                              width: 44, height: 44, borderRadius: "50%", objectFit: "cover",
                              flexShrink: 0, border: seen ? "none" : "2.5px solid #ec4899"
                            }}
                          />
                          <div className="grow">
                            <div className="bold small" style={{ color: "var(--ink-900)" }}>{s.authorName}</div>
                            {s.caption && (
                              <div className="tiny text-ellipsis" style={{ color: "var(--ink-600)", marginTop: 2 }}>
                                {s.caption}
                              </div>
                            )}
                            <div className="tiny muted" style={{ marginTop: 4 }}>
                              {s.postedAt} · {s.expiresInHrs}h left
                            </div>
                          </div>
                          <ChevronRight size={16} className="muted" />
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
