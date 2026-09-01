import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinPlus } from "@/components/Icons";
import Map, { Marker, Source, Layer } from "react-map-gl/maplibre";
import type { MapEvent, MapRef, ViewStateChangeEvent } from "react-map-gl/maplibre";
import type { Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { discoveryService, requestService, socialService, userService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { config } from "@/config";
import { StoryViewer } from "@/components/Stories";
import type { Story } from "@/types";
import { evaluateProviderAvailability } from "@/utils/availability";
import { RADIUS_OPTIONS, WORLD_RADIUS_KM } from "@/utils/constants";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";

import type { Layer as MapLayer } from "./mapIcons";
import { meIconHtml } from "./mapIcons";
import { RecenterButton, MapEventsController } from "./MapControllers";
import { SearchBar } from "./SearchBar";


import GuestRadiusNotice from "@/components/GuestRadiusNotice";
import LocationPickerSheet from "@/components/LocationPickerSheet";
import { GUEST_RADIUS_KM } from "@/lib/guestMode";
import { MapMarkers, type Selected } from "./MapMarkers";
import { MapCarousel } from "./MapCarousel";
import { MapSheet, NEXT_DETENT, type MapSheetDetent } from "./MapSheet";
import { haptics } from "@/lib/haptics";
import { MapFilterStrip, type ResultFilter } from "./MapFilterStrip";
import { PickCenterTracker, LocationPinDropOverlay } from "./LocationPinDrop";
import { useLocationPinDrop } from "./useLocationPinDrop";
import { useI18n } from "@/lib/i18n";
import { mapboxStyleUrl, makeMapboxTransformRequest } from "./mapboxFallback";
import { useMapViewport } from "./useMapViewport";
import { paletteFor, retintFor } from "./mapPalette";

// The default basemap — OpenFreeMap's open-source vector style, built from
// OpenStreetMap data. Mapbox is a fallback only (see FALLBACK_TIMEOUT_MS
// below), used solely if the free map hasn't loaded in time and a token is
// configured — never the primary provider.
//
// "liberty" over "positron": positron is deliberately flat/neutral (a good
// generic basemap, a bad brand surface), while liberty ships more built-in
// color/contrast for the retint below to work with. Verified before this
// switch: liberty resolves (200) at the same host — no CSP change needed,
// vercel.json already allowlists tiles.openfreemap.org — and its layer
// schema (water/landcover/park/transportation/building/place/…) is exactly
// what mapPalette.ts's retintFor() dispatches on. If OpenFreeMap ever
// retires this specific style, the retint below still carries the brand on
// whatever OpenMapTiles-schema style is loaded — that's the whole point of
// dispatching on source-layer instead of hardcoding this URL's specifics.
const FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/**
 * How long the free map gets to load before this map open gives up on it and
 * tries Mapbox instead (if a token is configured). Short, not the 30s an
 * earlier build gave Mapbox as the PRIMARY provider — OpenFreeMap is a lean
 * vector style that should load quickly under normal conditions, so this is
 * a safety net for "the free tile host is actually down," not a routine wait.
 */
const FALLBACK_TIMEOUT_MS = 8_000;

/**
 * Repaints the loaded style's own layers into the Street Light palette for
 * the given `lampGlow`. Declarative `<Source>/<Layer>` (the pattern the heat
 * layer uses) can't reach layers that came IN the style — those only exist
 * once the style has loaded, so this is imperative `setPaintProperty`, the
 * first in this codebase. Every call is wrapped: a layer whose type doesn't
 * support a given property throws in MapLibre, and one unexpected layer must
 * never take down the whole retint.
 */
function applyBasemapRetint(map: MaplibreMap, lampGlow: number) {
  const layers = map.getStyle()?.layers;
  if (!layers) return;
  const palette = paletteFor(lampGlow);
  for (const layer of layers) {
    const sourceLayer = "source-layer" in layer ? (layer as { "source-layer"?: string })["source-layer"] : undefined;
    const patches = retintFor(sourceLayer, layer.type, palette, layer.id);
    for (const patch of patches) {
      try {
        map.setPaintProperty(layer.id, patch.property, patch.value);
      } catch {
        // This layer doesn't support the property we guessed for its type —
        // skip it rather than let one mismatch break every other layer.
      }
    }
  }
}

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
  const { user, area, refreshUser, showToast, isGuest } = useApp();
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const { t, tf } = useI18n();
  const pin = useLocationPinDrop(refreshUser, showToast, (lat, lng) =>
    viewport.searchAt({ lat, lng, radiusKm: radiusOverride ?? viewport.searched.radiusKm })
  );
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
  // Replaces the old "map" | "list" toggle — that was a binary, unanimated,
  // instant cut with no state in between; this is the same idea with a real
  // drag gesture and a middle ground. "peek" = the tray (old "map" state),
  // "half"/"full" = the list (old "list" state) at two different heights.
  const [sheetDetent, setSheetDetent] = useState<MapSheetDetent>("peek");
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem("settings_map_filter", resultFilter);
  }, [resultFilter]);

  // Stories and places stay OUT of "all" on purpose: they're each a separate
  // query, and the old layer default had stories off for the same reason.
  // Picking their filter chip explicitly is what opts into that extra fetch.
  const layers = useMemo<Record<MapLayer, boolean>>(() => ({
    business: resultFilter === "all" || resultFilter === "business",
    provider: resultFilter === "all" || resultFilter === "provider",
    request: resultFilter === "all" || resultFilter === "request",
    story: resultFilter === "story",
    place: resultFilter === "place",
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

  const hasMapboxFallback = !!config.mapboxToken;
  const [mapStyle, setMapStyle] = useState(FREE_MAP_STYLE);
  const [usingMapbox, setUsingMapbox] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const styleLoadedRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);
  // Needed outside the <Map> subtree (useMap() only works inside it) so the
  // "Search this area" pill can read the live bounds at the moment it's tapped.
  const mapRef = useRef<MapRef>(null);
  // Set for the life of a carousel-driven easeTo (see easeToPoint) — swiping
  // through already-searched results must never register as "the user
  // panned," or every swipe would trigger "Search this area" on itself.
  const suppressViewportMoveRef = useRef(false);
  const transformRequest = useMemo(() => makeMapboxTransformRequest(config.mapboxToken), []);

  function handleMapLoad(event: MapEvent) {
    styleLoadedRef.current = true;
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    // Two-finger rotation is off by design. Every marker on this map is
    // upright HTML (`meIconHtml`, MapMarkers), so a rotated bearing leaves the
    // pins tilted against the labels — and users pinching to zoom rotate the
    // map by a few degrees without meaning to, then can't find north again.
    // `dragRotate`/`touchPitch` below cover the pointer equivalents.
    event.target.touchZoomRotate?.disableRotation();
    // Applied here (not just in the lampGlow effect below) because this is
    // the one moment the style is GUARANTEED loaded — `mapReady` also gets
    // set by the veil timer (MAP_VEIL_MAX_MS) whether or not the style
    // actually finished, so it can't be trusted alone as "safe to paint".
    if (!usingMapbox) applyBasemapRetint(event.target, ambientTheme.lampGlow);
    setMapReady(true);
  }

  // The one fallback decision point for this map open — never re-armed, and
  // nothing else (an onError warning, a slow tile) triggers it early, so a
  // momentary hiccup can't eject someone off the free map over a false alarm.
  useEffect(() => {
    if (!hasMapboxFallback) return;
    fallbackTimerRef.current = window.setTimeout(() => {
      if (styleLoadedRef.current) return; // free map came through just in time
      if (import.meta.env.DEV) {
        console.warn(`[MapView] OpenFreeMap hadn't loaded in ${FALLBACK_TIMEOUT_MS / 1000}s — falling back to Mapbox.`);
      }
      setMapStyle(mapboxStyleUrl(config.mapboxToken));
      setUsingMapbox(true);
    }, FALLBACK_TIMEOUT_MS);
    return () => {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lift the veil on a short timer regardless of the style-load event — see
  // MAP_VEIL_MAX_MS. A half-drawn map the user can already pan beats a spinner.
  useEffect(() => {
    if (mapReady) return;
    const timer = window.setTimeout(() => setMapReady(true), MAP_VEIL_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [mapReady]);

  // Re-warms the basemap as lampGlow moves through the day — the initial
  // paint happens in handleMapLoad (the one moment the style is guaranteed
  // loaded); this keeps it in step afterward without waiting for a remount.
  // `isStyleLoaded()` guards against the veil-timer's `mapReady` firing
  // before the real load event has (see handleMapLoad's comment) — if the
  // style genuinely isn't ready yet, this quietly skips rather than risking
  // a setPaintProperty on a style still being parsed.
  useEffect(() => {
    if (!mapReady || usingMapbox) return;
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;
    applyBasemapRetint(map, ambientTheme.lampGlow);
  }, [ambientTheme.lampGlow, mapReady, usingMapbox]);

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
    // Same suppression easeToPoint uses: this fitBounds is the radius choice
    // driving the camera, not the user panning away from it — without this,
    // a big enough radius jump (its fitBounds crosses a full zoom level) got
    // read as "moved away from the search," which swapped the Filters
    // trigger for a redundant "Search this area" button with no way back to
    // Filters short of tapping it.
    suppressViewportMoveRef.current = true;
    const latDelta = km / 111;
    const lngDelta = km / (111 * Math.cos((centerLat * Math.PI) / 180) || 1);
    map.fitBounds(
      [[centerLng - lngDelta, centerLat - latDelta], [centerLng + lngDelta, centerLat + latDelta]],
      { padding: 48, duration: 600 },
    );
    map.once("moveend", () => { suppressViewportMoveRef.current = false; });
  }
  const isWorld = searchRadiusKm >= WORLD_RADIUS_KM;

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

  // Rounded to ~1km precision so small GPS jitter reuses the same cache entry
  // instead of missing on every tiny position change.
  const geoCacheKey = isWorld ? "world" : `${centerLat.toFixed(2)}:${centerLng.toFixed(2)}:${searchRadiusKm}`;

  // For "World" use a globally-sorted (newest-first) query with no geo filter
  //
  // cacheKey below makes revisiting the Map tab show the last-known pins
  // instantly (stale-while-revalidate, see useApi.ts) instead of refetching
  // from a blank slate every mount — the map's own GL instance already
  // persists across navigation (reuseMaps), the data layer hadn't caught up.
  const { data: bizPage, loading: bizLoading } = useQuery(
    () => isWorld
      ? discoveryService.businesses({ sort: "new" })
      : discoveryService.businesses({ lat: centerLat, lng: centerLng, radius: searchRadiusKm }),
    [centerLat, centerLng, searchRadiusKm],
    `map:biz:${geoCacheKey}`
  );
  const { data: provPage, loading: provLoading } = useQuery(
    () => isWorld
      ? discoveryService.providers({ sort: "new" })
      : discoveryService.providers({ lat: centerLat, lng: centerLng, radius: searchRadiusKm }),
    [centerLat, centerLng, searchRadiusKm],
    `map:prov:${geoCacheKey}`
  );
  const { data: reqPage } = useQuery(
    () => requestService.feed({ lat: centerLat, lng: centerLng }),
    [centerLat, centerLng],
    `map:req:${geoCacheKey}`
  );
  const { data: nearbyStories } = useQuery(
    () => layers.story
      ? socialService.storiesNearby(centerLat, centerLng, Math.min(searchRadiusKm, 200))
      : Promise.resolve([]),
    [layers.story, centerLat, centerLng, searchRadiusKm],
    layers.story ? `map:story:${geoCacheKey}` : undefined
  );
  const { data: nearbyPlaces } = useQuery(
    () => layers.place
      ? discoveryService.places({ lat: centerLat, lng: centerLng, radius: isWorld ? undefined : searchRadiusKm })
      : Promise.resolve([]),
    [layers.place, centerLat, centerLng, searchRadiusKm, isWorld],
    layers.place ? `map:place:${geoCacheKey}` : undefined
  );

  const businesses = bizPage?.data ?? [];
  const providers  = provPage?.data ?? [];
  const requests   = (reqPage?.data ?? []).filter((r) => r.status === "OPEN");
  const mapStories = (nearbyStories ?? []).filter((s) => s.lat && s.lng);
  const places     = (nearbyPlaces ?? []).filter((pl) => pl.lat && pl.lng);

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
  const shownPlaces = layers.place ? places : [];
  const resultCounts: Record<ResultFilter, number> = {
    all: shownBusinesses.length + shownProviders.length + shownRequests.length + shownStories.length,
    business: shownBusinesses.length,
    provider: shownProviders.length,
    request: shownRequests.length,
    story: shownStories.length,
    place: shownPlaces.length,
  };

  const brandColor = useMemo(() => resolveToken("--brand-600", "#7c2fe8"), []);
  // Ring shows the area the RESULTS came from, so a user who has panned away
  // can see at a glance that what's on screen belongs somewhere else.
  const radiusRing = useMemo(
    () => (isWorld ? null : circleGeoJSON(centerLat, centerLng, searchRadiusKm)),
    [centerLat, centerLng, searchRadiusKm, isWorld]
  );

  // Compass line connecting user center to currently selected pin
  const selectedCoords = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "business") {
      const b = businesses.find((x) => x.id === selected.id);
      return b && b.lat && b.lng ? { lat: b.lat, lng: b.lng } : null;
    }
    if (selected.kind === "provider") {
      const p = providers.find((x) => x.id === selected.id);
      return p && p.lat && p.lng ? { lat: p.lat, lng: p.lng } : null;
    }
    if (selected.kind === "request") {
      const r = requests.find((x) => x.id === selected.id);
      return r && r.lat && r.lng ? { lat: r.lat, lng: r.lng } : null;
    }
    if (selected.kind === "place") {
      const pl = places.find((x) => x.id === selected.id);
      return pl && pl.lat && pl.lng ? { lat: pl.lat, lng: pl.lng } : null;
    }
    return null;
  }, [selected, businesses, providers, requests, places]);

  const compassLineGeoJSON = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(() => {
    if (!selectedCoords) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [centerLng, centerLat],
          [selectedCoords.lng, selectedCoords.lat],
        ],
      },
    };
  }, [centerLat, centerLng, selectedCoords]);

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
            onPickArea={(place) => flyToPlace(place.lat, place.lng)}
            onPickShop={(shop) => flyToPlace(shop.lat, shop.lng)}
            onResultsVisibleChange={setSearchOpen}
            areaLabel={area}
            onOpenAreaPicker={() => setAreaPickerOpen(true)}
          />

          {!searchOpen && (
            <MapFilterStrip
              filter={resultFilter}
              setFilter={setResultFilter}
              counts={resultCounts}
              availOnly={availOnly}
              setAvailOnly={setAvailOnly}
              radiusKm={radiusOverride}
              currentRadiusKm={searchRadiusKm}
              // Guests are capped at GUEST_RADIUS_KM, so offering the row would be
              // offering choices that silently don't apply.
              onRadiusChange={isGuest ? undefined : applyRadius}
              radiusOptions={RADIUS_OPTIONS}
              detent={sheetDetent}
              onCycleDetent={() => {
                haptics.selection();
                setSheetDetent((d) => NEXT_DETENT[d]);
              }}
              searchThisArea={{
                visible: viewport.hasMoved,
                busy: bizLoading || provLoading,
                onClick: () => viewport.searchHere(mapRef.current?.getMap()),
              }}
            />
          )}

          {/* The old "N places" badge and the RadiusStrip are retired (radius
              derives from zoom by default — see useMapViewport; an explicit
              override is now inside MapFilterStrip's popover). Guests keep
              their notice; the 1 km cap itself is applied to the searched
              area, not just to a hidden control. */}
          {isGuest && <div className="map-bottom-dock"><GuestRadiusNotice /></div>}

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

      {/* Full-screen map — OpenFreeMap's open-source basemap, or Mapbox if it
          hasn't loaded within FALLBACK_TIMEOUT_MS. */}
      <Map
        // Framed on the USER's location; `searched` then follows wherever they
        // ask. Using `centerLat/Lng` here would re-frame the map every time a
        // new area was searched, fighting the user's own panning.
        initialViewState={{ longitude: homeLng, latitude: homeLat, zoom: 13 }}
        mapStyle={mapStyle}
        transformRequest={transformRequest}
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
        {!pin.pickMode && (
          <RecenterButton
            radiusKm={initialRadiusKm}
            onRecentered={(lat, lng) => viewport.searchAt({ lat, lng, radiusKm: radiusOverride ?? viewport.searched.radiusKm })}
          />
        )}
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

        {/* Radius ring — visual coverage circle */}
        {radiusRing && (
          <Source id="radius-ring" type="geojson" data={radiusRing}>
            <Layer
              id="radius-ring-fill"
              type="fill"
              paint={{ "fill-color": brandColor, "fill-opacity": 0.08 }}
            />
            <Layer
              id="radius-ring-line"
              type="line"
              paint={{
                "line-color": brandColor,
                "line-width": 2,
                "line-dasharray": [3, 2],
                "line-opacity": 0.85,
              }}
            />
          </Source>
        )}

        {/* Northern Edge Range Pill directly on the map */}
        {radiusRing && searchRadiusKm > 0 && searchRadiusKm < WORLD_RADIUS_KM && (
          <Marker
            longitude={centerLng}
            latitude={centerLat + searchRadiusKm / 111}
            anchor="bottom"
          >
            <div className="map-radius-edge-pill">
              <span>🎯</span>
              <span>
                {searchRadiusKm < 1
                  ? `${Math.round(searchRadiusKm * 1000)}m range`
                  : `${searchRadiusKm.toFixed(1).replace(/\.0$/, "")} km range`}
              </span>
            </div>
          </Marker>
        )}

        {/* Compass Line connecting user to selected pin */}
        {compassLineGeoJSON && (
          <Source id="compass-line" type="geojson" data={compassLineGeoJSON}>
            <Layer
              id="compass-line-layer"
              type="line"
              paint={{
                "line-color": brandColor,
                "line-width": 2.5,
                "line-dasharray": [2, 2],
                "line-opacity": 0.85,
              }}
            />
          </Source>
        )}

        <MapMarkers
          layers={layers}
          filteredBusinesses={filteredBusinesses}
          filteredProviders={filteredProviders}
          nearbyRequests={nearbyRequests}
          mapStories={mapStories}
          filteredPlaces={shownPlaces}
          onStoryClick={(stories, idx) => setStoryViewer({ stories, idx })}
          selected={selected}
          onSelect={setSelected}
        />
      </Map>

      {/* Required credit — a plain link, not the interactive "ⓘ" control
          MapLibre renders by default (disabled above via
          attributionControl={false}). Small and low-contrast on purpose, but
          present, and switches to Mapbox's own required attribution whenever
          the fallback is actually active — Mapbox's terms ask for their own
          credit alongside OpenStreetMap's, not just the latter. */}
      {usingMapbox ? (
        <span className="map-attribution">
          <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer">© Mapbox</a>
          {" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>
        </span>
      ) : (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="map-attribution"
        >
          © OpenStreetMap contributors
        </a>
      )}

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

      {areaPickerOpen && (
        <LocationPickerSheet
          onClose={() => setAreaPickerOpen(false)}
          onLocationChanged={(lat, lng) =>
            viewport.searchAt({ lat, lng, radiusKm: radiusOverride ?? viewport.searched.radiusKm })
          }
        />
      )}

      {!pin.pickMode && (
        <MapSheet detent={sheetDetent} onDetentChange={setSheetDetent}>
          <MapCarousel
            centerLat={centerLat}
            centerLng={centerLng}
            loading={bizLoading || provLoading}
            businesses={shownBusinesses}
            providers={shownProviders}
            requests={shownRequests}
            stories={shownStories}
            places={shownPlaces}
            selected={selected}
            onSelect={setSelected}
            onEaseTo={easeToPoint}
            onStoryClick={(stories, idx) => setStoryViewer({ stories, idx })}
            isListView={sheetDetent !== "peek"}
          />
        </MapSheet>
      )}
    </div>
  );
}
