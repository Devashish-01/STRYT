import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinPlus } from "@/components/Icons";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import type { MapEvent, MapRef, ViewStateChangeEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { discoveryService, requestService, socialService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { config } from "@/config";
import { StoryViewer } from "@/components/Stories";
import type { Story } from "@/types";
import { evaluateProviderAvailability } from "@/utils/availability";
import { RADIUS_OPTIONS } from "@/utils/constants";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";

import type { Layer as MapLayer } from "./mapIcons";
import { meIconHtml } from "./mapIcons";
import { RecenterButton, MapEventsController } from "./MapControllers";
import { SearchBar } from "./SearchBar";


import GuestRadiusNotice from "@/components/GuestRadiusNotice";
import { GUEST_RADIUS_KM } from "@/lib/guestMode";
import { MapMarkers, type Selected } from "./MapMarkers";
import { MapCarousel } from "./MapCarousel";
import { MapFilterStrip, type ResultFilter } from "./MapFilterStrip";
import { PickCenterTracker, LocationPinDropOverlay } from "./LocationPinDrop";
import { useLocationPinDrop } from "./useLocationPinDrop";
import { useI18n } from "@/lib/i18n";
import { useMapViewport } from "./useMapViewport";
import SearchThisArea from "./SearchThisArea";

// The only basemap this app renders — OpenFreeMap's open-source vector
// style, built from OpenStreetMap data.
const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

/**
 * The veil hides only the initial blank-canvas flash. It lifts as soon as the
 * style loads or this elapses, whichever comes first, so a slow connection
 * gets a partly-drawn, already-pannable map instead of an indefinite spinner,
 * and tiles keep streaming in underneath it either way.
 */
const MAP_VEIL_MAX_MS = 2_500;

/**
 * Below this many visible businesses, MapLibre's heatmap kernel has nothing
 * to blend — a couple of points render as isolated soft dots, not a glow,
 * which reads as broken rather than "not much happening here yet" (Phase E,
 * MAP_SNAPCHAT_STYLE_PLAN.md §2.4). Skip the layer entirely below this, same
 * as not showing a chart with one data point.
 */
const HEAT_MIN_BUSINESSES = 8;

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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Blends the heat layer's hue between the brand purple and a warm amber as
// `lampGlow` rises toward night — "the map glows like a street lamp," not a
// fixed Snapchat-orange (MAP_SNAPCHAT_STYLE_PLAN.md §2.4/§0). Blended once in
// JS rather than left as two static color stops because MapLibre's
// `heatmap-color` expression has no notion of "the ambient theme," only
// whatever literal colors it's handed.
function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round) as [number, number, number];
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
  // No lat/lng passed in — the heat layer only needs lampGlow (pure time-of-
  // day), not weather-driven copy, and DesktopSidebar already sets the
  // precedent for calling this arg-less to skip the weather fetch entirely.
  // Passing the live searched center here would re-fetch weather on every
  // pan/search, unlike Home's fixed profile location.
  const ambientTheme = useAmbientTheme();
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

  // Which pin/card is selected — one state, driving both the map's Popup
  // (MapMarkers) and the carousel's scroll position (MapCarousel), so tapping
  // either surface updates the other (Phase C, MAP_SNAPCHAT_STYLE_PLAN.md §2.1).
  const [selected, setSelected] = useState<Selected>(null);

  const [mapReady, setMapReady] = useState(false);
  // Needed outside the <Map> subtree (useMap() only works inside it) so the
  // "Search this area" pill can read the live bounds at the moment it's tapped.
  const mapRef = useRef<MapRef>(null);
  // Set for the life of a carousel-driven easeTo (see easeToPoint) — swiping
  // through already-searched results must never register as "the user
  // panned," or every swipe would trigger "Search this area" on itself.
  const suppressViewportMoveRef = useRef(false);

  function handleMapLoad(event: MapEvent) {
    // Two-finger rotation is off by design. Every marker on this map is
    // upright HTML (`meIconHtml`, MapMarkers), so a rotated bearing leaves the
    // pins tilted against the labels — and users pinching to zoom rotate the
    // map by a few degrees without meaning to, then can't find north again.
    // `dragRotate`/`touchPitch` below cover the pointer equivalents.
    event.target.touchZoomRotate?.disableRotation();
    setMapReady(true);
  }

  // Lift the veil on a short timer regardless of the style-load event — see
  // MAP_VEIL_MAX_MS. A half-drawn map the user can already pan beats a spinner.
  useEffect(() => {
    if (mapReady) return;
    const timer = window.setTimeout(() => setMapReady(true), MAP_VEIL_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [mapReady]);

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

  // Soft camera pan to a result already on screen — what the carousel drives
  // as you scroll or tap a card (Phase C). Deliberately NOT flyToPlace: this
  // is "look at this one," not "search here" — it must never touch
  // `searched`/re-fetch, or every swipe through the current results would
  // fire a fresh query. Same easing duration as PickCenterTracker's glide.
  function easeToPoint(lat: number, lng: number) {
    const map = mapRef.current?.getMap();
    if (!map) return;
    suppressViewportMoveRef.current = true;
    map.easeTo({ center: [lng, lat], duration: 350 });
    // Cleared on THIS ease's own moveend — not a timer guess — so a genuine
    // pan starting right after isn't accidentally swallowed too.
    map.once("moveend", () => { suppressViewportMoveRef.current = false; });
  }

  // Wraps viewport.onMapMove so a carousel-driven easeTo's moveend/zoomend
  // doesn't reach it — see easeToPoint and suppressViewportMoveRef above.
  function handleMapMoveEnd(e: ViewStateChangeEvent) {
    if (suppressViewportMoveRef.current) return;
    viewport.onMapMove(e);
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

  // ── Heat layer (Phase E, MAP_SNAPCHAT_STYLE_PLAN.md §2.4) ──────────────
  // Reuses shownBusinesses — already gated by the business-layer toggle and
  // availOnly the same way the carousel and filter counts are, so filtering
  // to "People" or "Open now" also empties the glow instead of leaving it
  // describing shops that are no longer even shown.
  const heatPurpleRgb = useMemo(() => hexToRgb(resolveToken("--brand-500", "#8b47f5")), []);
  const heatAmberRgb = useMemo(() => hexToRgb(resolveToken("--accent-400", "#ffba2b")), []);
  const showHeat = shownBusinesses.length >= HEAT_MIN_BUSINESSES;
  // Plain, not memoized — shownBusinesses is itself a fresh array every
  // render (same as resultCounts above), so a useMemo here would never
  // actually stabilize; mapping it is cheap enough not to need to.
  const heatData: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: "FeatureCollection",
    features: shownBusinesses.map((b) => {
      const isOpen = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
      // Open shops read as "happening now"; closed ones still mark the block
      // as a shopping street, just fainter — providers are excluded entirely
      // (services aren't "foot traffic" the same way a shop front is).
      return {
        type: "Feature" as const,
        properties: { weight: isOpen ? 2 : 1 },
        geometry: { type: "Point" as const, coordinates: [b.lng, b.lat] },
      };
    }),
  };
  const heatPaint = useMemo(() => {
    const [r, g, b] = mixRgb(heatPurpleRgb, heatAmberRgb, ambientTheme.lampGlow);
    const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;
    return {
      "heatmap-weight": ["get", "weight"],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 14, 2.2],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(0,0,0,0)",
        0.2, rgba(0.22),
        0.4, rgba(0.42),
        0.6, rgba(0.62),
        0.8, rgba(0.80),
        1, rgba(0.92),
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 14, 16, 34],
      // Faint by day, fuller at night — the same "the street lights up after
      // dark" signal the header's own lamp glow already uses.
      "heatmap-opacity": 0.25 + ambientTheme.lampGlow * 0.45,
    };
  }, [heatPurpleRgb, heatAmberRgb, ambientTheme.lampGlow]);

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

      {/* Full-screen map — OpenFreeMap's open-source basemap. */}
      <Map
        // Framed on the USER's location; `searched` then follows wherever they
        // ask. Using `centerLat/Lng` here would re-frame the map every time a
        // new area was searched, fighting the user's own panning.
        initialViewState={{ longitude: homeLng, latitude: homeLat, zoom: 13 }}
        mapStyle={FREE_MAP_STYLE}
        onLoad={handleMapLoad}
        // Tracks where the map IS, so the pill knows when the on-screen results
        // stopped describing what's visible. Deliberately does not trigger a
        // query — see useMapViewport.
        onMoveEnd={handleMapMoveEnd}
        onZoomEnd={handleMapMoveEnd}
        ref={mapRef}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        // MapLibre's own interactive "ⓘ" control is off — replaced below by a
        // small static credit line. OpenStreetMap's data license (ODbL) still
        // requires attribution to be visibly present, just not as a button.
        attributionControl={false}
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

        {/* Business density + open-now glow — under the radius ring so the
            ring's boundary still reads clearly on top of it. Hidden below
            HEAT_MIN_BUSINESSES rather than rendering a sparse, broken-looking
            scatter of faint dots. */}
        {showHeat && (
          <Source id="business-heat" type="geojson" data={heatData}>
            {/* MapLibre expression arrays don't infer against the style-spec's
                deeply recursive paint union from a plain object literal — same
                class of interop friction MapControllers.tsx already casts
                through `any` for map event typing. */}
            <Layer id="business-heat-layer" type="heatmap" paint={heatPaint as any} />
          </Source>
        )}

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
          selected={selected}
          onSelect={setSelected}
        />
      </Map>

      {/* Required OpenStreetMap/OpenFreeMap credit — a plain link, not the
          interactive "ⓘ" control MapLibre renders by default (disabled above
          via attributionControl={false}). Small and low-contrast on purpose,
          but present: this app has no other basemap to fall back to. */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="map-attribution"
      >
        © OpenStreetMap contributors
      </a>

      {/* Covers the initial blank canvas only. Kept mounted and faded out (rather
          than unmounted outright) so the map doesn't pop into view. */}
      <div className={`map-loading-veil${mapReady ? " is-hidden" : ""}`} aria-hidden={mapReady}>
        <div className="map-loading-spinner spin" />
        <span className="tiny semi">Loading map…</span>
      </div>

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
          selected={selected}
          onSelect={setSelected}
          onEaseTo={easeToPoint}
          onStoryClick={(stories, idx) => setStoryViewer({ stories, idx })}
        />
      )}
    </div>
  );
}
