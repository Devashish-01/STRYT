import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { LngLatBoundsLike } from "maplibre-gl";
import { useApp } from "@/store";
import { config } from "@/config";
import { MapLocateButton } from "@/components/MapLocateButton";
import { recognizeLocation, requestPreciseLocation } from "@/lib/mapLocate";
import type { PreciseIssueMode } from "@/components/PreciseLocationSheet";
import { useI18n } from "@/lib/i18n";

// MapLibre (like every GL map) takes coordinates as [lng, lat] — the
// opposite order from Leaflet's [lat, lng]. Mixing these up silently points
// the map at the wrong hemisphere rather than erroring, so every conversion
// point in this file is commented.

// Approximates Leaflet's `L.latLng(lat,lng).toBounds(radiusKm*2000)` (a box
// centered on the point, side = 2×radius) using the standard ~111km/degree
// latitude approximation, adjusted by cos(lat) for longitude at that
// latitude. Good enough for map framing — not survey-grade, doesn't need
// to be.
function boundsForRadius(lat: number, lng: number, radiusKm: number): LngLatBoundsLike {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return [
    [lng - lngDelta, lat - latDelta], // southwest [lng, lat]
    [lng + lngDelta, lat + latDelta], // northeast [lng, lat]
  ];
}

// RadiusController lived here. Its only job was re-framing the map when the
// radius strip changed; the strip retired with the map redesign (zoom now
// defines the searched area), so it had nothing left to react to.

// Flies to the current user location and updates their DB coordinates to GPS coords on tap
export function RecenterButton({
  radiusKm,
  onRecentered,
  onPermissionIssue,
}: {
  radiusKm: number;
  /** Fired with the fresh GPS fix once the camera has moved — lets the
   *  caller also re-run its live query (viewport.searchAt), which this
   *  button used to only look like it did: it panned the map, but the
   *  results underneath stayed keyed to wherever was last searched until a
   *  second tap on the "Search this area" pill that then popped up. */
  onRecentered?: (lat: number, lng: number, accuracy?: number) => void;
  onPermissionIssue?: (issue: PreciseIssueMode) => void;
}) {
  const { current: mapRef } = useMap();
  const { user, showToast } = useApp();
  const { t, tf } = useI18n();
  const lat = user.lat || config.defaultLocation.lat;
  const lng = user.lng || config.defaultLocation.lng;

  const recenterMap = (targetLat: number, targetLng: number) => {
    const map = mapRef?.getMap();
    if (!map) return;
    if (radiusKm >= 5000) {
      map.flyTo({ center: [targetLng, targetLat], zoom: 5, duration: 800 });
    } else {
      map.fitBounds(boundsForRadius(targetLat, targetLng, radiusKm), { padding: 60, duration: 800 });
    }
  };

  // Single tap: recognize current location cleanly without re-nagging for Precise.
  const handleSingleTap = async () => {
    const { fix, state } = await recognizeLocation();
    if (fix) {
      recenterMap(fix.lat, fix.lng);
      onRecentered?.(fix.lat, fix.lng, fix.accuracy);
    } else if (state === "denied") {
      onPermissionIssue?.("denied");
    } else {
      showToast(t("map_gps_unavailable"));
      recenterMap(lat, lng);
    }
  };

  // Double tap: trigger system precise-location prompt / settings upgrade + fresh GPS fix.
  const handleDoubleTap = async () => {
    showToast(t("map_precise_asking"));
    const { fix, state, openedSettings } = await requestPreciseLocation();
    if (fix) {
      recenterMap(fix.lat, fix.lng);
      onRecentered?.(fix.lat, fix.lng, fix.accuracy);
      if (fix.precision === "precise" && typeof fix.accuracy === "number") {
        showToast(tf("map_precise_updated", { m: Math.max(1, Math.round(fix.accuracy)) }));
      }
    } else if (state === "denied") {
      onPermissionIssue?.("denied");
    } else if (!openedSettings && state !== "precise") {
      onPermissionIssue?.("approximate_locked");
    }
  };

  return (
    <MapLocateButton
      icon="navigation"
      className="icon-btn map-glass-panel map-fab-recenter"
      ariaLabel={t("map_recenter_aria")}
      title={`${t("map_recenter_title")} · ${t("map_locate_hint")}`}
      onSingleTap={handleSingleTap}
      onDoubleTap={handleDoubleTap}
    />
  );

}

/** How long a finger/cursor must rest before a press counts as "long". */
const LONG_PRESS_MS = 550;
/** Pixels of drift allowed during a long press before it's treated as a pan. */
const LONG_PRESS_SLOP_PX = 8;

/**
 * Long-press / right-click on the map opens the pin-drop confirm flow at that
 * point.
 *
 * It deliberately does NOT write the location itself. It used to: a 600 ms
 * press fired `userService.setLocation()` straight away, so resting a finger
 * for a moment before panning silently rewrote the user's saved location and
 * re-fetched every nearby query. Handing off to the existing confirm overlay
 * (the same one the pin FAB opens) makes the gesture previewable and
 * cancellable, which is how every native map behaves.
 */
export function MapEventsController({ onLongPress }: { onLongPress: (lat: number, lng: number) => void }) {
  const { current: mapRef } = useMap();
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  // Held in a ref so the listener effect doesn't re-subscribe (and drop an
  // in-flight press) every time the parent re-renders with a new closure.
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const startPress = (e: any) => {
      if (!e?.lngLat) return;
      cancelPress();
      pressOriginRef.current = e.point ? { x: e.point.x, y: e.point.y } : null;
      const { lat, lng } = e.lngLat;
      pressTimeoutRef.current = setTimeout(() => {
        pressTimeoutRef.current = null;
        onLongPressRef.current(lat, lng);
      }, LONG_PRESS_MS);
    };

    const cancelPress = () => {
      pressOriginRef.current = null;
      if (pressTimeoutRef.current) {
        clearTimeout(pressTimeoutRef.current);
        pressTimeoutRef.current = null;
      }
    };

    // A press that drifts more than a few pixels is a pan, not a long press.
    // Cancelling only on `touchmove`/`dragstart` was too coarse: a slow drag
    // could cross the threshold before MapLibre called it a drag.
    const onMove = (e: any) => {
      const origin = pressOriginRef.current;
      if (!origin || !e?.point) return;
      if (Math.hypot(e.point.x - origin.x, e.point.y - origin.y) > LONG_PRESS_SLOP_PX) cancelPress();
    };

    const onContextMenu = (e: any) => {
      cancelPress();
      if (e?.lngLat) onLongPressRef.current(e.lngLat.lat, e.lngLat.lng);
    };

    map.on("mousedown", startPress);
    map.on("touchstart", startPress as any);
    map.on("mousemove", onMove);
    map.on("touchmove", onMove as any);
    map.on("mouseup", cancelPress);
    map.on("touchend", cancelPress as any);
    map.on("touchcancel", cancelPress as any);
    map.on("dragstart", cancelPress);
    map.on("zoomstart", cancelPress);
    map.on("contextmenu", onContextMenu);

    return () => {
      map.off("mousedown", startPress);
      map.off("touchstart", startPress as any);
      map.off("mousemove", onMove);
      map.off("touchmove", onMove as any);
      map.off("mouseup", cancelPress);
      map.off("touchend", cancelPress as any);
      map.off("touchcancel", cancelPress as any);
      map.off("dragstart", cancelPress);
      map.off("zoomstart", cancelPress);
      map.off("contextmenu", onContextMenu);
      cancelPress();
    };
  }, [mapRef]);

  return null;
}
