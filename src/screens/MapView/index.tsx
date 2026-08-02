import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MapPinPlus } from "@/components/Icons";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import type { MapEvent } from "react-map-gl/maplibre";
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
import { rememberMapboxFallback, makeMapboxTransformRequest, shouldAttemptMapbox, mapboxStyleUrl } from "./mapboxFallback";

// Free, open-source basemap — the fallback when Mapbox can't be shown.
const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

/**
 * Mapbox gets this long to finish loading before we give up on it for this
 * map open and drop to the free (lower-detail) basemap, so a user on a bad
 * connection still gets a usable map instead of an indefinite spinner.
 */
const MAPBOX_LOAD_TIMEOUT_MS = 30_000;
/**
 * The veil hides only the initial blank-canvas flash — it is NOT tied to the
 * 30s deadline above. Holding a full-screen spinner for half a minute would be
 * worse than showing a partly-drawn map, so it lifts as soon as the style
 * loads or this elapses, whichever comes first, and tiles stream in under it.
 */
const MAP_VEIL_MAX_MS = 2_500;

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

  // Mapbox is the default basemap whenever a token is configured. The free
  // style is a fallback, not a rotation: the basemap is chosen once per map
  // open and then left alone. An earlier build also swapped down to the free
  // style after 30s of inactivity and back up on the next touch — but changing
  // `mapStyle` tears down and rebuilds every source, layer and marker, so the
  // map visibly flashed and re-drew the moment the user came back to it. A map
  // that restyles itself under your finger never feels native, and the saving
  // was illusory for an active user (it re-billed a Mapbox load on every
  // return), so the style is now stable for the life of the screen.
  const canUseMapbox = MAPBOX_PRIMARY_MAP_ENABLED && shouldAttemptMapbox(config.mapboxToken);
  const mapboxStyle = useMemo(() => mapboxStyleUrl(config.mapboxToken), []);
  const [mapStyle, setMapStyle] = useState(() => (canUseMapbox ? mapboxStyle : FREE_MAP_STYLE));
  const [mapReady, setMapReady] = useState(() => !canUseMapbox);
  const mapboxLoadedRef = useRef(false);
  const mountedRef = useRef(true);
  const loadTimerRef = useRef<number | null>(null);
  const transformRequest = useMemo(() => makeMapboxTransformRequest(config.mapboxToken), []);

  useEffect(() => {
    mountedRef.current = true;
    if (!config.mapboxToken && import.meta.env.DEV) {
      console.warn("[MapView] VITE_MAPBOX_TOKEN is missing — copy .env.example to .env and add your Mapbox token to use Mapbox tiles locally.");
    }
    if (config.mapboxToken && import.meta.env.DEV) {
      console.info(`[MapView] Mapbox token loaded — basemap starts on Mapbox; falls back to the free style if it hasn't loaded in ${MAPBOX_LOAD_TIMEOUT_MS / 1000}s.`);
    }
    return () => { mountedRef.current = false; };
  }, []);

  function fallBackToFreeMap() {
    if (!mountedRef.current || mapboxLoadedRef.current) return;
    if (!import.meta.env.DEV) rememberMapboxFallback();
    setMapStyle(FREE_MAP_STYLE);
    setMapReady(true);
  }

  function handleMapLoad(event: MapEvent) {
    mapboxLoadedRef.current = true;
    if (loadTimerRef.current) {
      window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
    // Two-finger rotation is off by design. Every marker on this map is
    // upright HTML (`meIconHtml`, MapMarkers), so a rotated bearing leaves the
    // pins tilted against the labels — and users pinching to zoom rotate the
    // map by a few degrees without meaning to, then can't find north again.
    // `dragRotate`/`touchPitch` below cover the pointer equivalents.
    event.target.touchZoomRotate?.disableRotation();
    setMapReady(true);
  }

  function handleMapError(event: unknown) {
    // MapLibre can emit non-fatal tile/sprite errors while Mapbox is still
    // loading — don't eject to the free basemap on the first warning; the
    // timeout below is the single decision point.
    if (mapboxLoadedRef.current) return;
    if (import.meta.env.DEV) {
      console.warn("[MapView] Mapbox load warning (waiting for style or timeout):", event);
    }
  }

  useEffect(() => {
    if (!canUseMapbox) return;
    loadTimerRef.current = window.setTimeout(fallBackToFreeMap, MAPBOX_LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lift the veil on a short timer regardless of the 30s style deadline — see
  // MAP_VEIL_MAX_MS. A half-drawn map the user can already pan beats a spinner.
  useEffect(() => {
    if (mapReady) return;
    const timer = window.setTimeout(() => setMapReady(true), MAP_VEIL_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [mapReady]);

  const usingMapbox = mapStyle.includes("api.mapbox.com");

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
            /* Wrapped, not passed by reference — enterPickMode now takes an
               optional start point and would otherwise receive the click event. */
            onClick={() => pin.enterPickMode()}
          >
            <MapPinPlus size={18} color="var(--brand-600)" />
          </button>
        </>
      )}

      {/* Full-screen map — Mapbox, or OpenFreeMap if Mapbox couldn't load in time. */}
      <Map
        initialViewState={{ longitude: centerLng, latitude: centerLat, zoom: 13 }}
        mapStyle={mapStyle}
        transformRequest={transformRequest}
        onLoad={handleMapLoad}
        onError={handleMapError}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        attributionControl={{ compact: true }}
        // Keep the GL context alive across tab switches. Without this, leaving
        // and re-entering the Map tab re-initialises the whole map — a white
        // flash, then tiles fading back in, every single time.
        reuseMaps
        // North-up, flat, inertial: the gesture set a native map app exposes.
        // See handleMapLoad for the touch-rotate half of this.
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        maxPitch={0}
        // Flick-pan momentum: MapLibre's default deceleration is tuned for
        // desktop and stops noticeably short of a native mobile map. Easing it
        // off more slowly is most of what separates a map that feels native
        // from one that feels like a scrolling div.
        dragPan={{ deceleration: 1400 }}
      >
        <RadiusController lat={centerLat} lng={centerLng} radiusKm={radiusKm} />
        {!pin.pickMode && <RecenterButton radiusKm={radiusKm} />}
        {!pin.pickMode && (
          <MapEventsController onLongPress={(lat, lng) => pin.enterPickMode({ lat, lng })} />
        )}
        {pin.pickMode && <PickCenterTracker onCenterChange={pin.onCenterChange} startAt={pin.pickStart} />}

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

      {/* Covers the initial blank canvas only. Kept mounted and faded out (rather
          than unmounted outright) so the map doesn't pop into view. */}
      <div className={`map-loading-veil${mapReady ? " is-hidden" : ""}`} aria-hidden={mapReady}>
        <div className="map-loading-spinner spin" />
        <span className="tiny semi">Loading map…</span>
      </div>

      {import.meta.env.DEV && canUseMapbox && mapReady && (
        <div
          className="tiny semi"
          style={{
            position: "absolute",
            top: "calc(8px + var(--safe-area-top))",
            right: 8,
            zIndex: 6,
            padding: "4px 8px",
            borderRadius: 8,
            background: usingMapbox ? "var(--brand-100)" : "var(--delivery-50)",
            color: usingMapbox ? "var(--brand-800)" : "var(--delivery-600)",
            pointerEvents: "none",
          }}
        >
          {usingMapbox ? "Mapbox" : "Open map"}
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
