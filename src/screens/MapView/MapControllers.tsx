import { useEffect, useRef, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { useApp } from "@/store";
import { MapLocateButton } from "@/components/MapLocateButton";
import { locateWithCalibration } from "@/lib/mapLocate";
import { useI18n } from "@/lib/i18n";
import { mapRadiusBounds } from "./mapRadiusBounds";
import type { PreciseIssueMode } from "@/components/PreciseLocationSheet";

// MapLibre (like every GL map) takes coordinates as [lng, lat] — the
// opposite order from Leaflet's [lat, lng]. Mixing these up silently points
// the map at the wrong hemisphere rather than erroring, so every conversion
// point in this file is commented.

// RadiusController lived here. Its only job was re-framing the map when the
// radius strip changed; the strip retired with the map redesign (zoom now
// defines the searched area), so it had nothing left to react to.

// Flies to the calibrated user GPS location on tap; prompts directly for Precise
// permission when missing or surfaces the friendly PreciseLocationSheet if locked.
export function RecenterButton({
  radiusKm,
  onRecentered,
  onPermissionIssue,
}: {
  radiusKm: number;
  /** Fired with the calibrated GPS fix once the camera has moved. */
  onRecentered?: (lat: number, lng: number, accuracy?: number) => void;
  /** Fired when Precise GPS is locked to Approximate, denied, or device GPS is off. */
  onPermissionIssue?: (issue: PreciseIssueMode) => void;
}) {
  const { current: mapRef } = useMap();
  const { showToast } = useApp();
  const { t, tf } = useI18n();
  const [calibrating, setCalibrating] = useState(false);

  const recenterMap = (targetLat: number, targetLng: number) => {
    const map = mapRef?.getMap();
    if (!map) return;
    if (radiusKm >= 5000) {
      map.flyTo({ center: [targetLng, targetLat], zoom: 5, duration: 800 });
    } else {
      map.fitBounds(mapRadiusBounds(targetLat, targetLng, radiusKm), { padding: 60, duration: 800 });
    }
  };

  const handleLocate = async () => {
    setCalibrating(true);
    const hintTimer = window.setTimeout(() => showToast(t("map_precise_asking")), 700);
    try {
      const res = await locateWithCalibration();
      window.clearTimeout(hintTimer);
      if (res.status === "calibrated" && res.fix) {
        recenterMap(res.fix.lat, res.fix.lng);
        onRecentered?.(res.fix.lat, res.fix.lng, res.fix.accuracy);
        if (typeof res.fix.accuracy === "number") {
          showToast(tf("map_precise_updated", { m: Math.max(1, Math.round(res.fix.accuracy)) }));
        }
        return;
      }
      if (res.status === "approximate_locked" || res.status === "denied" || res.status === "gps_off") {
        onPermissionIssue?.(res.status);
        return;
      }
      showToast(t("map_gps_unavailable"));
    } finally {
      window.clearTimeout(hintTimer);
      setCalibrating(false);
    }
  };

  return (
    <MapLocateButton
      icon="navigation"
      busy={calibrating}
      className="icon-btn map-glass-panel map-fab-recenter"
      ariaLabel={t("map_recenter_aria")}
      title={t("map_locate_hint")}
      onLocate={handleLocate}
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
