import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MapPinPlus } from "@/components/Icons";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { discoveryService, requestService, socialService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { config } from "@/config";
import { MAPBOX_PRIMARY_MAP_ENABLED } from "@/lib/features";
import { StoryViewer } from "@/components/Stories";
import type { Story } from "@/types";
import { evaluateProviderAvailability } from "@/utils/availability";
import { RADIUS_OPTIONS } from "@/utils/constants";
import type { Layer as MapLayer } from "./mapIcons";
import { meIconHtml } from "./mapIcons";
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
import { hasMapboxFallenBackThisSession, rememberMapboxFallback, makeMapboxTransformRequest } from "./mapboxFallback";

// Free, open-source, no API key/account of any kind — see openfreemap.org.
// Positron: a clean, minimal light basemap (closest match to the CARTO
// Voyager tiles this screen used before), so STRYT's own purple/pink pins
// and UI stay the visual focus rather than a busy basemap. This is the
// fallback/default: see MAPBOX_STYLE below for the primary attempt.
const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// Mapbox's own minimal light style — chosen to match FREE_MAP_STYLE's "clean,
// pins stay the focus" intent, so a fallback mid-session isn't jarring. Only
// meaningful when a token is configured; MAP_ATTEMPTS_MAPBOX below decides
// whether this is ever actually requested.
const MAPBOX_STYLE = `https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=${config.mapboxToken}`;

// Skip Mapbox entirely (go straight to the free style, no wait, no flash) when
// the feature is off, no token is configured, or Mapbox already failed once
// this session — see mapboxFallback.ts for the session-memory reasoning.
const MAP_ATTEMPTS_MAPBOX =
  MAPBOX_PRIMARY_MAP_ENABLED && !!config.mapboxToken && !hasMapboxFallenBackThisSession();

const MAPBOX_LOAD_TIMEOUT_MS = 7000;

// haversine, km — same distance math the old Leaflet build used
// (L.latLng(...).distanceTo(...)), just without the Leaflet dependency.
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// MapLibre paint properties are WebGL, not CSS — they can't read a
// var(--token) directly. Resolving it at runtime (rather than hardcoding the
// hex, which the repo's color-lint script would also flag) keeps this
// derived from the one real token instead of a second, driftable copy of it.
function resolveToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// A circle-as-polygon GeoJSON feature — MapLibre has no built-in <Circle>
// (unlike react-leaflet), so the radius ring is a Source+Layer instead.
function circleGeoJSON(lat: number, lng: number, radiusKm: number, points = 72): GeoJSON.Feature<GeoJSON.Polygon> {
  const latRad = (lat * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    coords.push([lng + dx / (111 * Math.cos(latRad)), lat + dy / 111]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

export default function MapView() {
  const { user, refreshUser, showToast, isGuest } = useApp();
  const { t, tf } = useI18n();
  const pin = useLocationPinDrop(refreshUser, showToast);
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>(() => {
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

  // Mapbox-primary, free-map-fallback. mapReady starts true when we're not
  // even attempting Mapbox (skipped entirely — no wait, no flash, identical
  // to this screen's long-standing free-only behavior). transformRequest is
  // only needed while actually pointed at Mapbox; harmless either way since
  // it no-ops for any non-"mapbox://" URL.
  const [mapStyle, setMapStyle] = useState(() => (MAP_ATTEMPTS_MAPBOX ? MAPBOX_STYLE : FREE_MAP_STYLE));
  const [mapReady, setMapReady] = useState(() => !MAP_ATTEMPTS_MAPBOX);
  const mapboxSettledRef = useRef(!MAP_ATTEMPTS_MAPBOX);
  const transformRequest = useMemo(() => makeMapboxTransformRequest(config.mapboxToken), []);

  function fallBackToFreeMap() {
    if (mapboxSettledRef.current) return; // already loaded, or already fell back
    mapboxSettledRef.current = true;
    rememberMapboxFallback();
    setMapStyle(FREE_MAP_STYLE);
    // FREE_MAP_STYLE has been this screen's only style until now and has
    // always loaded fast/reliably — treating the switch itself as "ready"
    // avoids chasing maplibre-gl's per-style-change load events for a style
    // that's never actually been the slow part.
    setMapReady(true);
  }

  useEffect(() => {
    if (!MAP_ATTEMPTS_MAPBOX) return;
    const timer = window.setTimeout(fallBackToFreeMap, MAPBOX_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
    // Deliberately once-only (mount/unmount): MAP_ATTEMPTS_MAPBOX is a
    // module-level constant and fallBackToFreeMap only closes over refs/setters.
  }, []);

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
    return distanceKm(centerLat, centerLng, r.lat, r.lng) <= radiusKm;
  });

  const visibleCount =
    (layers.business ? filteredBusinesses.length : 0) +
    (layers.provider ? filteredProviders.length : 0) +
    (layers.request  ? nearbyRequests.length : 0) +
    (layers.story    ? mapStories.length : 0);

  const brandColor = useMemo(() => resolveToken("--brand-600", "#7c2fe8"), []);
  const radiusRing = useMemo(
    () => (isWorld ? null : circleGeoJSON(centerLat, centerLng, radiusKm)),
    [centerLat, centerLng, radiusKm, isWorld]
  );

  return (
    <div className="screen screen-canvas map-screen" style={{ position: "relative" }}>
      {!pin.pickMode && (
        <>
          <SearchBar />

          <LayerToggles layers={layers} setLayers={setLayers} availOnly={availOnly} setAvailOnly={setAvailOnly} />

          <div className="map-bottom-dock">
            {visibleCount > 0 && (
              <button
                type="button"
                className="map-places-badge"
                onClick={() => setShowNearbyPopup(true)}
              >
                <span>
                  {visibleCount === 1 ? tf("map_place_one", { count: visibleCount }) : tf("map_place_other", { count: visibleCount })}
                  {isWorld ? t("map_globally") : isCustomActive ? tf("map_within_km", { km: radiusKm }) : ` within ${RADIUS_OPTIONS.find(o => o.km === radiusKm)?.label}`}
                </span>
                <ChevronRight size={14} style={{ opacity: 0.8, flexShrink: 0 }} />
              </button>
            )}

            {isGuest ? (
              <GuestRadiusNotice />
            ) : (
              <RadiusStrip radiusKm={radiusKm} setRadiusKm={setRadiusKm} />
            )}
          </div>

          <button
            type="button"
            className="icon-btn map-glass-panel map-fab-pin"
            title={t("map_set_location_manually")}
            onClick={pin.enterPickMode}
          >
            <MapPinPlus size={18} color="var(--brand-600)" />
          </button>
        </>
      )}

      {/* Full-screen map — MapLibre GL (open-source renderer either way).
          Web and Android app both render this exact screen — Capacitor's
          WebView is just a browser, so there's no native/web split needed
          here. mapStyle is Mapbox first, free OpenFreeMap tiles as the
          automatic fallback — see the state/effect above. */}
      <Map
        initialViewState={{ longitude: centerLng, latitude: centerLat, zoom: 13 }}
        mapStyle={mapStyle}
        transformRequest={transformRequest}
        onLoad={() => { mapboxSettledRef.current = true; setMapReady(true); }}
        onError={fallBackToFreeMap}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        attributionControl={{ compact: true }}
      >
        <RadiusController lat={centerLat} lng={centerLng} radiusKm={radiusKm} />
        {!pin.pickMode && <RecenterButton radiusKm={radiusKm} />}
        {!pin.pickMode && <MapEventsController />}
        {pin.pickMode && <PickCenterTracker onCenterChange={pin.onCenterChange} />}

        {/* User dot */}
        <Marker longitude={centerLng} latitude={centerLat} anchor="center">
          <span dangerouslySetInnerHTML={{ __html: meIconHtml }} />
        </Marker>

        {/* Radius ring — hidden for World mode */}
        {radiusRing && (
          <Source id="radius-ring" type="geojson" data={radiusRing}>
            <Layer id="radius-ring-fill" type="fill" paint={{ "fill-color": brandColor, "fill-opacity": 0.05 }} />
            <Layer
              id="radius-ring-line"
              type="line"
              paint={{ "line-color": brandColor, "line-width": 1.5, "line-dasharray": [2, 1.5] }}
            />
          </Source>
        )}

        <MapMarkers
          layers={layers}
          filteredBusinesses={filteredBusinesses}
          filteredProviders={filteredProviders}
          nearbyRequests={nearbyRequests}
          mapStories={mapStories}
          onStoryClick={(stories, idx) => setStoryViewer({ stories, idx })}
        />
      </Map>

      {/* Only ever shown during a Mapbox attempt — the free style has always
          loaded fast enough to need nothing (see MAP_ATTEMPTS_MAPBOX above),
          so most sessions never render this at all. Backstopped by the 7s
          timeout: this can never stay up longer than that. */}
      {!mapReady && (
        <div className="map-loading-veil">
          <div className="map-loading-spinner spin" />
          <span className="tiny semi">Loading map…</span>
        </div>
      )}

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
