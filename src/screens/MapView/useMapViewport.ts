import { useCallback, useRef, useState } from "react";
import type { ViewStateChangeEvent } from "react-map-gl/maplibre";

/**
 * The area the map is currently *searching* — as opposed to the area it's
 * currently *showing*.
 *
 * Before this, every discovery query on the map screen was keyed on
 * `user.lat`/`user.lng` — the saved profile location — so panning to another
 * neighbourhood returned identical results. The map was a viewer of a fixed
 * circle around where you live, which is also why it needed a radius strip, a
 * radius ring and a recenter button to operate a circle you couldn't drag.
 *
 * Here the two are deliberately separated:
 *   · `searched`  — what the current results belong to. Only changes when the
 *                   user asks (the "Search this area" pill) or on first load.
 *   · `live`      — where the map actually is right now, updated as it moves.
 *
 * Results therefore never shift under someone who is just looking around, and
 * a query costs exactly one tap. `hasMoved` is what decides whether the pill is
 * worth showing at all.
 */

export interface SearchArea {
  lat: number;
  lng: number;
  /** Radius in km covering the visible map, derived from the viewport. */
  radiusKm: number;
}

/** Clamped so a zoomed-way-out map can't ask the API for the whole planet. */
const MIN_RADIUS_KM = 0.4;
const MAX_RADIUS_KM = 200;

/** Fraction of the current radius the centre must move before the pill appears. */
const MOVE_THRESHOLD = 0.25;
/** Or this much zoom change — zooming out reveals area without moving the centre. */
const ZOOM_THRESHOLD = 1;

const KM_PER_DEG_LAT = 111;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * KM_PER_DEG_LAT;
  const dLng = (lng2 - lng1) * KM_PER_DEG_LAT * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Radius that covers the visible map.
 *
 * Uses the real bounds when MapLibre can give them (correct at any aspect
 * ratio), and falls back to a zoom approximation before the map has painted —
 * `getBounds()` isn't meaningful until then.
 */
export function radiusFromMap(map: maplibregl.Map | undefined, zoom: number, lat: number): number {
  try {
    const b = map?.getBounds();
    if (b) {
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      // Half the diagonal — the circle that contains the visible rectangle.
      const halfDiagonal = distanceKm(sw.lat, sw.lng, ne.lat, ne.lng) / 2;
      if (Number.isFinite(halfDiagonal) && halfDiagonal > 0) {
        return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, halfDiagonal));
      }
    }
  } catch { /* fall through to the zoom estimate */ }

  // ~156 km per tile at z0, halving each level; × a rough half-viewport factor.
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const approx = (metersPerPixel * 400) / 1000;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, approx));
}

export function useMapViewport(initial: SearchArea) {
  // What the visible results belong to. Query deps read from here ONLY.
  const [searched, setSearched] = useState<SearchArea>(initial);
  // Where the map is now. A ref, not state: this updates on every frame of a
  // drag and must never re-render the screen.
  const liveRef = useRef<SearchArea>(initial);
  // Cheap boolean derived from the ref — the one thing a move may re-render.
  const [hasMoved, setHasMoved] = useState(false);
  const searchedZoomRef = useRef<number>(0);

  const onMapMove = useCallback((e: ViewStateChangeEvent) => {
    const map = e.target;
    const c = map.getCenter();
    const zoom = map.getZoom();
    const radiusKm = radiusFromMap(map, zoom, c.lat);
    liveRef.current = { lat: c.lat, lng: c.lng, radiusKm };

    const base = searchedZoomRef.current;
    const moved =
      distanceKm(searched.lat, searched.lng, c.lat, c.lng) > searched.radiusKm * MOVE_THRESHOLD ||
      (base > 0 && Math.abs(zoom - base) >= ZOOM_THRESHOLD);

    // Only ever flip the flag, never store the position — otherwise every
    // frame of a pan would re-render the whole screen and its marker list.
    setHasMoved((prev) => (prev === moved ? prev : moved));
  }, [searched]);

  /** Adopt the current viewport as the searched area. */
  const searchHere = useCallback((map?: maplibregl.Map) => {
    if (map) {
      const c = map.getCenter();
      const zoom = map.getZoom();
      searchedZoomRef.current = zoom;
      liveRef.current = { lat: c.lat, lng: c.lng, radiusKm: radiusFromMap(map, zoom, c.lat) };
    }
    setSearched(liveRef.current);
    setHasMoved(false);
  }, []);

  /** Jump the searched area somewhere explicit (recenter, a picked place). */
  const searchAt = useCallback((area: SearchArea) => {
    liveRef.current = area;
    setSearched(area);
    setHasMoved(false);
  }, []);

  return { searched, hasMoved, onMapMove, searchHere, searchAt, liveRef };
}
