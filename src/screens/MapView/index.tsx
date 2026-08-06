import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinPlus } from "@/components/Icons";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import type { MapEvent, MapRef } from "react-map-gl/maplibre";
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
import { RecenterButton, MapEventsController } from "./MapControllers";
import { SearchBar } from "./SearchBar";


import GuestRadiusNotice from "@/components/GuestRadiusNotice";
import { GUEST_RADIUS_KM } from "@/lib/guestMode";
import { MapMarkers } from "./MapMarkers";
import { MapCarousel } from "./MapCarousel";
import { MapFilterStrip, type ResultFilter } from "./MapFilterStrip";
import { PickCenterTracker, LocationPinDropOverlay } from "./LocationPinDrop";
import { useLocationPinDrop } from "./useLocationPinDrop";
import { useI18n } from "@/lib/i18n";
import { rememberMapboxFallback, makeMapboxTransformRequest, shouldAttemptMapbox, mapboxStyleUrl } from "./mapboxFallback";
import { useMapViewport } from "./useMapViewport";
import SearchThisArea from "./SearchThisArea";

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
  // One filter now drives BOTH the sheet list and which markers are on the map.
  // Previously these were separate (LayerToggles for the map, tabs inside the
  // NearbySheet for the list), so the list could show things the map didn't.
  const [resultFilter, setResultFilter] = useState<ResultFilter>(() => {
    const saved = localStorage.getItem("settings_map_filter");
    return (saved as ResultFilter) || "all";
  });
  useEffect(() => {
    localStorage.setItem("settings_map_filter", resultFilter);
  }, [resultFilter]);

  // Stories stay OUT of "all" on purpose: they're a separate query, and the
  // old layer default had them off for the same reason. Picking the Stories
  // filter is what opts into that cost.
  const layers = useMemo<Record<MapLayer, boolean>>(() => ({
    business: resultFilter === "all" || resultFilter === "business",
    provider: resultFilter === "all" || resultFilter === "provider",
    request: resultFilter === "all" || resultFilter === "request",
    story: resultFilter === "story",
  }), [resultFilter]);
  const [availOnly, setAvailOnly] = useState(() => {
    const saved = localStorage.getItem("settings_map_avail_only");
    return saved === "true";
  });
  // Only the STARTING search radius now — after first paint the searched area
  // comes from the viewport (useMapViewport). Guests are clamped to
  // GUEST_RADIUS_KM, applied to the area actually queried rather than by hiding
  // a control, so zooming out can't quietly widen it.
  //
  // The map deliberately no longer WRITES notificationRadiusKm. The old radius
  // strip doubled as a profile setting, which is part of why this screen was
  // overloaded — and now that nothing here changes the radius, that write would
  // only ever push a stale localStorage value over the user's real preference.
  // Settings → Notifications owns it (NotificationSettings.tsx).
  const initialRadiusKm = isGuest
    ? GUEST_RADIUS_KM
    : (() => {
        const saved = localStorage.getItem("settings_radius");
        const n = saved ? parseFloat(saved) : (user.notificationRadiusKm || 5);
        return Number.isFinite(n) && n > 0 ? n : 5;
      })();

  useEffect(() => {
    localStorage.setItem("settings_map_avail_only", String(availOnly));
  }, [availOnly]);

  const [storyViewer, setStoryViewer] = useState<{ stories: Story[]; idx: number } | null>(null);

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
  // Needed outside the <Map> subtree (useMap() only works inside it) so the
  // "Search this area" pill can read the live bounds at the moment it's tapped.
  const mapRef = useRef<MapRef>(null);
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


  // Where the map is FRAMED on open — still the user's own location.
  const homeLat = user.lat || config.defaultLocation.lat;
  const homeLng = user.lng || config.defaultLocation.lng;

  // Where the results come FROM. Starts at the user, then follows wherever they
  // ask to search. Previously these were the same thing, which is why panning
  // the map never changed a single pin.
  //
  // Guests stay clamped to GUEST_RADIUS_KM here rather than merely having the
  // radius control hidden — the cap has to apply to the area actually queried,
  // or zooming out would quietly widen it.
  const viewport = useMapViewport({
    lat: homeLat,
    lng: homeLng,
    radiusKm: initialRadiusKm,
  });
  const searched = viewport.searched;
  const centerLat = searched.lat;
  const centerLng = searched.lng;

  // An explicit "within N km", or null to follow the map's zoom.
  //
  // The redesign derived radius purely from zoom, which removed the control
  // people were actually using. "How far" and "where" are separate questions:
  // zoom answers neither well on its own, so radius is explicit again and
  // panning still decides the centre. Null keeps the zoom-derived behaviour as
  // the default.
  const [radiusOverride, setRadiusOverride] = useState<number | null>(() => {
    const saved = localStorage.getItem("settings_map_radius_override");
    if (saved === null || saved === "") return null;
    const n = parseFloat(saved);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  useEffect(() => {
    localStorage.setItem("settings_map_radius_override", radiusOverride == null ? "" : String(radiusOverride));
  }, [radiusOverride]);

  const searchRadiusKm = isGuest
    ? Math.min(radiusOverride ?? searched.radiusKm, GUEST_RADIUS_KM)
    : (radiusOverride ?? searched.radiusKm);

  // Picking a radius re-frames the map around it so the ring, the pins and the
  // list all describe the same circle — otherwise "within 10 km" while zoomed
  // into one street is a claim the screen visibly contradicts.
  function applyRadius(km: number | null) {
    setRadiusOverride(km);
    if (km == null) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const latDelta = km / 111;
    const lngDelta = km / (111 * Math.cos((centerLat * Math.PI) / 180) || 1);
    map.fitBounds(
      [[centerLng - lngDelta, centerLat - latDelta], [centerLng + lngDelta, centerLat + latDelta]],
      { padding: 48, duration: 600 },
    );
  }
  const isWorld = false; // "World" was a radius-strip mode; it retires with the strip (Phase 3).

  // Move the map to an explicitly picked point — a searched area, or a shop
  // from the search dropdown — and make that the SEARCHED area too, not just
  // where the camera lands.
  //
  // Found while wiring this up: the old SearchBar called
  // userService.setLocation() on every picked area, permanently overwriting
  // the user's saved profile location just for looking somewhere else.
  // Deliberately not done here — searching from the map is a viewport
  // operation (useMapViewport), same as panning or "Search this area"; it
  // must never rewrite what the user's own location is.
  function flyToPlace(lat: number, lng: number) {
    // An explicit radius choice (§ applyRadius) is honoured rather than reset,
    // so jumping to a new area while "within 10 km" is selected keeps that
    // circle instead of silently narrowing it. With no override, 2 km is a
    // "just arrived, let's look around" default — tighter than the 5 km
    // fallback used before any radius is chosen at all, because someone who
    // just searched for a specific place wants to see what's near THAT point
    // now, not re-run their original broad radius somewhere new.
    const framingKm = radiusOverride ?? 2;
    const map = mapRef.current?.getMap();
    if (map) {
      const latDelta = framingKm / 111;
      const lngDelta = framingKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
      map.fitBounds(
        [[lng - lngDelta, lat - latDelta], [lng + lngDelta, lat + latDelta]],
        { padding: 48, duration: 800 },
      );
    }
    viewport.searchAt({ lat, lng, radiusKm: framingKm });
  }

  // For "World" use a globally-sorted (newest-first) query with no geo filter
  const { data: bizPage, loading: bizLoading } = useQuery(
    () => isWorld
      ? discoveryService.businesses({ sort: "new" })
      : discoveryService.businesses({ lat: centerLat, lng: centerLng, radius: searchRadiusKm }),
    [centerLat, centerLng, searchRadiusKm]
  );
  const { data: provPage, loading: provLoading } = useQuery(
    () => isWorld
      ? discoveryService.providers({ sort: "new" })
      : discoveryService.providers({ lat: centerLat, lng: centerLng, radius: searchRadiusKm }),
    [centerLat, centerLng, searchRadiusKm]
  );
  const { data: reqPage } = useQuery(() => requestService.feed({ lat: centerLat, lng: centerLng }), [centerLat, centerLng]);
  const { data: nearbyStories } = useQuery(
    () => layers.story
      ? socialService.storiesNearby(centerLat, centerLng, Math.min(searchRadiusKm, 200))
      : Promise.resolve([]),
    [layers.story, centerLat, centerLng, searchRadiusKm]
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
    return distanceKm(centerLat, centerLng, r.lat, r.lng) <= searchRadiusKm;
  });

  // Gated the same way the old sheet's props were: a layer that's off isn't
  // just hidden on the map, it's excluded from the carousel and the filter
  // chip's counts too — switching to "Shops" means providers/requests/stories
  // weren't fetched into these lists at all, not merely filtered out below.
  const shownBusinesses = layers.business ? filteredBusinesses : [];
  const shownProviders = layers.provider ? filteredProviders : [];
  const shownRequests = layers.request ? nearbyRequests : [];
  const shownStories = layers.story ? mapStories : [];
  const resultCounts: Record<ResultFilter, number> = {
    all: shownBusinesses.length + shownProviders.length + shownRequests.length + shownStories.length,
    business: shownBusinesses.length,
    provider: shownProviders.length,
    request: shownRequests.length,
    story: shownStories.length,
  };

  const brandColor = useMemo(() => resolveToken("--brand-600", "#7c2fe8"), []);
  // Ring shows the area the RESULTS came from, so a user who has panned away
  // can see at a glance that what's on screen belongs somewhere else.
  const radiusRing = useMemo(
    () => (isWorld ? null : circleGeoJSON(centerLat, centerLng, searchRadiusKm)),
    [centerLat, centerLng, searchRadiusKm, isWorld]
  );

  return (
    <div className="screen screen-canvas map-screen" style={{ position: "relative" }}>
      {!pin.pickMode && (
        <>
          <SearchBar
            centerLat={centerLat}
            centerLng={centerLng}
            onPickArea={(area) => flyToPlace(area.lat, area.lng)}
            onPickShop={(shop) => flyToPlace(shop.lat, shop.lng)}
          />

          <MapFilterStrip
            filter={resultFilter}
            setFilter={setResultFilter}
            counts={resultCounts}
            availOnly={availOnly}
            setAvailOnly={setAvailOnly}
            radiusKm={radiusOverride}
            // Guests are capped at GUEST_RADIUS_KM, so offering the row would be
            // offering choices that silently don't apply.
            onRadiusChange={isGuest ? undefined : applyRadius}
            radiusOptions={RADIUS_OPTIONS}
          />

          {/* The old "N places" badge and the RadiusStrip are retired (radius
              derives from zoom by default — see useMapViewport; an explicit
              override is now inside MapFilterStrip's popover). Guests keep
              their notice; the 1 km cap itself is applied to the searched
              area, not just to a hidden control. */}
          {isGuest && <div className="map-bottom-dock"><GuestRadiusNotice /></div>}

          <SearchThisArea
            visible={viewport.hasMoved}
            busy={bizLoading || provLoading}
            onClick={() => viewport.searchHere(mapRef.current?.getMap())}
          />

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
        // Framed on the USER's location; `searched` then follows wherever they
        // ask. Using `centerLat/Lng` here would re-frame the map every time a
        // new area was searched, fighting the user's own panning.
        initialViewState={{ longitude: homeLng, latitude: homeLat, zoom: 13 }}
        mapStyle={mapStyle}
        transformRequest={transformRequest}
        onLoad={handleMapLoad}
        onError={handleMapError}
        // Tracks where the map IS, so the pill knows when the on-screen results
        // stopped describing what's visible. Deliberately does not trigger a
        // query — see useMapViewport.
        onMoveEnd={viewport.onMapMove}
        onZoomEnd={viewport.onMapMove}
        ref={mapRef}
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
        {/* Framed on HOME, not on the searched area. Feeding it `centerLat`
            would re-run fitBounds every time the user tapped "Search this
            area", yanking the map back to fit that circle and undoing the pan
            they had just made. This controller's job is only "the radius strip
        {/* RadiusController retired with the radius strip: its only job was
            re-framing the map when the strip changed, and nothing changes the
            radius any more — zoom defines the searched area. */}
        {!pin.pickMode && <RecenterButton radiusKm={initialRadiusKm} />}
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

      {!pin.pickMode && (
        <MapCarousel
          centerLat={centerLat}
          centerLng={centerLng}
          loading={bizLoading || provLoading}
          businesses={shownBusinesses}
          providers={shownProviders}
          requests={shownRequests}
          stories={shownStories}
          onFlyTo={flyToPlace}
          onStoryClick={(stories, idx) => setStoryViewer({ stories, idx })}
        />
      )}
    </div>
  );
}
