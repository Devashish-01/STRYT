import { useEffect, useRef } from "react";
import { Navigation } from "@/components/Icons";
import { useMap } from "react-map-gl/maplibre";
import type { LngLatBoundsLike } from "maplibre-gl";
import { useApp } from "@/store";
import { reverseGeocode } from "@/lib/geocode";
import { config } from "@/config";
import { userService } from "@/services";
import { nativeGeolocation } from "@/lib/nativeGeolocation";
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

// Flies/zooms the map whenever the radius changes
export function RadiusController({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  const { current: mapRef } = useMap();
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    if (radiusKm >= 5000) {
      map.flyTo({ center: [0, 20], zoom: 2, duration: 1200 });
    } else {
      map.fitBounds(boundsForRadius(lat, lng, radiusKm), { padding: 60, duration: 800 });
    }
  }, [lat, lng, radiusKm, mapRef]);

  return null;
}

// Flies to the current user location and updates their DB coordinates to GPS coords on tap
export function RecenterButton({ radiusKm }: { radiusKm: number }) {
  const { current: mapRef } = useMap();
  const { user, showToast, refreshUser } = useApp();
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

  return (
    <button
      className="icon-btn map-glass-panel"
      title={t("map_recenter_title")}
      style={{ position: "absolute", bottom: 80, right: 16, zIndex: 1000 }}
      onClick={() => {
        nativeGeolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
              const areaName = await reverseGeocode(latitude, longitude);
              await userService.setLocation(latitude, longitude, areaName || "Current Location");
              await refreshUser();
              showToast(tf("map_location_set_gps", { area: areaName || "Current Location" }));
              recenterMap(latitude, longitude);
            } catch (err) {
              showToast(t("map_gps_update_failed"));
              recenterMap(latitude, longitude);
            }
          },
          (error) => {
            showToast(t("map_gps_unavailable"));
            recenterMap(lat, lng);
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }}
    >
      <Navigation size={18} color="var(--brand-500)" />
    </button>
  );

}

export function MapEventsController() {
  const { refreshUser, showToast } = useApp();
  const { t, tf } = useI18n();
  const { current: mapRef } = useMap();
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const startPress = (lngLat: { lat: number; lng: number }) => {
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = setTimeout(async () => {
        const { lat, lng } = lngLat;
        try {
          const areaName = (await reverseGeocode(lat, lng)) || "Custom Pin";
          await userService.setLocation(lat, lng, areaName);
          await refreshUser();
          showToast(tf("map_location_set_long_press", { area: areaName }));
        } catch {
          showToast(t("explore_location_failed"));
        }
      }, 600);
    };

    const cancelPress = () => {
      if (pressTimeoutRef.current) {
        clearTimeout(pressTimeoutRef.current);
        pressTimeoutRef.current = null;
      }
    };

    const onMouseDown = (e: any) => startPress(e.lngLat);
    const onMouseUp = () => cancelPress();
    const onTouchStart = (e: any) => {
      if (e.lngLat) startPress(e.lngLat);
    };
    const onTouchEnd = () => cancelPress();
    const onTouchMove = () => cancelPress();
    const onDragStart = () => cancelPress();
    const onZoomStart = () => cancelPress();
    const onContextMenu = async (e: any) => {
      cancelPress();
      const { lat, lng } = e.lngLat;
      try {
        const areaName = (await reverseGeocode(lat, lng)) || "Custom Pin";
        await userService.setLocation(lat, lng, areaName);
        await refreshUser();
        showToast(tf("map_location_set_context_menu", { area: areaName }));
      } catch {
        showToast(t("explore_location_failed"));
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
  }, [mapRef, refreshUser, showToast, t, tf]);

  return null;
}
