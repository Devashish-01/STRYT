import { useEffect, useState } from "react";
import { ChevronRight, MapPinPlus } from "@/components/Icons";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import { discoveryService, requestService, socialService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { config } from "@/config";
import { StoryViewer } from "@/components/Stories";
import type { Story } from "@/types";
import { evaluateProviderAvailability } from "@/utils/availability";
import { RADIUS_OPTIONS } from "@/utils/constants";
import type { Layer } from "./mapIcons";
import { meIcon } from "./mapIcons";
import { RadiusController, RecenterButton, MapEventsController } from "./MapControllers";
import { SearchBar } from "./SearchBar";
import { LayerToggles } from "./LayerToggles";
import { RadiusStrip } from "./RadiusStrip";
import GuestRadiusNotice from "@/components/GuestRadiusNotice";
import { GUEST_RADIUS_KM } from "@/lib/guestMode";
import { MapMarkers } from "./MapMarkers";
import { NearbySheet } from "./NearbySheet";
import { PickCenterTracker, LocationPinDropOverlay } from "./LocationPinDrop";
import { useLocationPinDrop } from "./useLocationPinDrop";
import { useI18n } from "@/lib/i18n";

export default function MapView() {
  const { user, refreshUser, showToast, isGuest } = useApp();
  const { t, tf } = useI18n();
  const pin = useLocationPinDrop(refreshUser, showToast);
  const [layers, setLayers] = useState<Record<Layer, boolean>>(() => {
    const saved = localStorage.getItem("settings_map_layers");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return { business: true, provider: true, request: true, story: false };
  });
  const [availOnly, setAvailOnly] = useState(() => {
    const saved = localStorage.getItem("settings_map_avail_only");
    return saved === "true";
  });
  const [savedRadiusKm, setRadiusKm] = useState(() => {
    const saved = localStorage.getItem("settings_radius");
    return saved ? parseFloat(saved) : (user.notificationRadiusKm || 5);
  });
  // Guests see the map, but pinned to 1 km with no way to widen it — the radius
  // strip is hidden for them (below), and this makes the cap real rather than
  // just unexposed, so a stale `settings_radius` from a previous signed-in
  // session on this device can't quietly widen a guest's map.
  const radiusKm = isGuest ? GUEST_RADIUS_KM : savedRadiusKm;

  useEffect(() => {
    // Never persist for a guest: they have no account to save a preference to,
    // and writing here would leave a footprint on their device (and survive
    // into a later signed-in session as if they'd chosen it).
    if (isGuest) return;
    localStorage.setItem("settings_radius", String(radiusKm));
    if (user.id && radiusKm !== user.notificationRadiusKm) {
      void userService.update({ notificationRadiusKm: radiusKm }).catch(() => {});
    }
  }, [isGuest, radiusKm, user.id, user.notificationRadiusKm]);

  useEffect(() => {
    localStorage.setItem("settings_map_layers", JSON.stringify(layers));
  }, [layers]);

  useEffect(() => {
    localStorage.setItem("settings_map_avail_only", String(availOnly));
  }, [availOnly]);

  const [storyViewer, setStoryViewer] = useState<{ stories: Story[]; idx: number } | null>(null);
  const [showNearbyPopup, setShowNearbyPopup] = useState(false);

  const presetKms = new Set<number>(RADIUS_OPTIONS.map((o) => o.km));
  const isCustomActive = !presetKms.has(radiusKm);

  const centerLat = user.lat || config.defaultLocation.lat;
  const centerLng = user.lng || config.defaultLocation.lng;
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
  const { data: reqPage } = useQuery(() => requestService.feed({ lat: centerLat, lng: centerLng }), [centerLat, centerLng]);
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

  const filteredBusinesses = businesses.filter((b) => {
    if (!b.lat || !b.lng) return false;
    if (!availOnly) return true;
    const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
    return evalRes.isOpenNow;
  });

  const filteredProviders = providers.filter((p) => {
    if (!p.lat || !p.lng) return false;
    if (!availOnly) return true;
    const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);
    return evalRes.isOpenNow;
  });

  const nearbyRequests = requests.filter((r) => {
    if (!r.lat || !r.lng) return false;
    if (isWorld) return true;
    const dist = L.latLng(centerLat, centerLng).distanceTo(L.latLng(r.lat, r.lng)) / 1000;
    return dist <= radiusKm;
  });

  const visibleCount =
    (layers.business ? filteredBusinesses.length : 0) +
    (layers.provider ? filteredProviders.length : 0) +
    (layers.request  ? nearbyRequests.length : 0) +
    (layers.story    ? mapStories.length : 0);

  return (
    <div className="screen screen-canvas" style={{ position: "relative" }}>
      {!pin.pickMode && (
        <>
          <SearchBar />

          <LayerToggles layers={layers} setLayers={setLayers} availOnly={availOnly} setAvailOnly={setAvailOnly} />

          {/* Visible-count badge (clickable button) */}
          {visibleCount > 0 && (
            <button
              onClick={() => setShowNearbyPopup(true)}
              style={{
                position: "absolute", bottom: 88, left: "50%", transform: "translateX(-50%)",
                zIndex: 1000, background: "var(--brand-600)", color: "#fff",
                borderRadius: 20, padding: "8px 16px", fontSize: 12, fontWeight: 700,
                boxShadow: "0 4px 16px rgba(107,33,204,0.35)", whiteSpace: "nowrap",
                border: "none", outline: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.2s ease-in-out",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--brand-700)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "var(--brand-600)"}
            >
              <span>
                {visibleCount === 1 ? tf("map_place_one", { count: visibleCount }) : tf("map_place_other", { count: visibleCount })}
                {isWorld ? t("map_globally") : isCustomActive ? tf("map_within_km", { km: radiusKm }) : ` within ${RADIUS_OPTIONS.find(o => o.km === radiusKm)?.label}`}
              </span>
              <ChevronRight size={14} style={{ opacity: 0.8 }} />
            </button>
          )}

          {/* Guests are pinned to 1 km, so there's nothing to choose here — the
              notice explains the cap instead. Positioned to sit exactly where
              the radius strip would (it's absolutely positioned inside the map;
              rendering the notice bare made it collapse invisibly). */}
          {isGuest ? (
            <div style={{
              position: "absolute", bottom: "calc(24px + var(--safe-area-bottom))",
              left: 12, right: 12, zIndex: 1000,
            }}>
              <GuestRadiusNotice />
            </div>
          ) : (
            <RadiusStrip radiusKm={radiusKm} setRadiusKm={setRadiusKm} />
          )}

          {/* Set-location-manually trigger, stacked above the recenter button */}
          <button
            className="icon-btn map-glass-panel"
            title={t("map_set_location_manually")}
            onClick={pin.enterPickMode}
            style={{ position: "absolute", bottom: 140, right: 16, zIndex: 1000 }}
          >
            <MapPinPlus size={18} color="var(--brand-600)" />
          </button>
        </>
      )}


      {/* Full-screen map */}
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={13}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        <RadiusController lat={centerLat} lng={centerLng} radiusKm={radiusKm} />
        {!pin.pickMode && <RecenterButton radiusKm={radiusKm} />}
        {!pin.pickMode && <MapEventsController />}
        {pin.pickMode && <PickCenterTracker onCenterChange={pin.onCenterChange} />}

        {/* User dot */}
        <Marker position={[centerLat, centerLng]} icon={meIcon} />

        {/* Radius ring — hidden for World mode */}
        {!isWorld && (
          <Circle
            center={[centerLat, centerLng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: "var(--brand-600)", weight: 1.5,
              dashArray: "6 5",
              fillColor: "var(--brand-600)", fillOpacity: 0.05,
              interactive: false,
            }}
          />
        )}

        <MapMarkers
          layers={layers}
          filteredBusinesses={filteredBusinesses}
          filteredProviders={filteredProviders}
          nearbyRequests={nearbyRequests}
          mapStories={mapStories}
          onStoryClick={(stories, idx) => setStoryViewer({ stories, idx })}
        />
      </MapContainer>

      {pin.pickMode && (
        <LocationPinDropOverlay
          address={pin.address}
          addressLoading={pin.addressLoading}
          confirming={pin.confirming}
          onConfirm={pin.confirmPickMode}
          onCancel={pin.cancelPickMode}
        />
      )}

      {storyViewer && (
        <StoryViewer
          stories={storyViewer.stories}
          startIndex={storyViewer.idx}
          onClose={() => setStoryViewer(null)}
        />
      )}

      {showNearbyPopup && (
        <NearbySheet
          visibleCount={visibleCount}
          isWorld={isWorld}
          radiusKm={radiusKm}
          filteredBusinesses={filteredBusinesses}
          filteredProviders={filteredProviders}
          mapStories={mapStories}
          nearbyRequests={nearbyRequests}
          onClose={() => setShowNearbyPopup(false)}
          onStoryClick={(stories, idx) => setStoryViewer({ stories, idx })}
        />
      )}
    </div>
  );
}
