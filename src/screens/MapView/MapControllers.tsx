import { useEffect, useRef } from "react";
import { Navigation } from "@/components/Icons";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { useApp } from "@/store";
import { reverseGeocode } from "@/lib/geocode";
import { config } from "@/config";
import { userService } from "@/services";
import { nativeGeolocation } from "@/lib/nativeGeolocation";

// Flies/zooms the map whenever the radius changes
export function RadiusController({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    if (radiusKm >= 5000) {
      map.flyTo([20, 0], 2, { duration: 1.2 });
    } else {
      // toBounds() computes a geographic box from the center point alone — no map
      // attachment needed. (L.circle(...).getBounds() throws because an unadded
      // circle has no _map to project pixels with.) Box side = 2 × radius.
      const bounds = L.latLng(lat, lng).toBounds(radiusKm * 2000);
      map.fitBounds(bounds, { padding: [60, 80], animate: true, duration: 0.8 });
    }
  }, [lat, lng, radiusKm, map]);

  return null;
}

// Flies to the current user location and updates their DB coordinates to GPS coords on tap
export function RecenterButton({ radiusKm }: { radiusKm: number }) {
  const map = useMap();
  const { user, showToast, refreshUser } = useApp();
  const lat = user.lat || config.defaultLocation.lat;
  const lng = user.lng || config.defaultLocation.lng;

  const recenterMap = (targetLat: number, targetLng: number) => {
    if (radiusKm >= 5000) {
      map.flyTo([targetLat, targetLng], 5, { duration: 0.8 });
    } else {
      const bounds = L.latLng(targetLat, targetLng).toBounds(radiusKm * 2000);
      map.fitBounds(bounds, { padding: [60, 80], animate: true, duration: 0.8 });
    }
  };

  return (
    <button
      className="icon-btn"
      title="Re-centre"
      style={{ background: "#fff", boxShadow: "var(--shadow)", position: "absolute", bottom: 80, right: 16, zIndex: 1000 }}
      onClick={() => {
        nativeGeolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
              const areaName = await reverseGeocode(latitude, longitude);
              await userService.setLocation(latitude, longitude, areaName || "Current Location");
              await refreshUser();
              showToast(`Location set to GPS — ${areaName || "Current Location"}`);
              recenterMap(latitude, longitude);
            } catch (err) {
              showToast("Couldn't update saved location to GPS.");
              recenterMap(latitude, longitude);
            }
          },
          (error) => {
            showToast("GPS unavailable. Centering on last saved location.");
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
  const map = useMap();
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const startPress = (latlng: L.LatLng) => {
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = setTimeout(async () => {
        const { lat, lng } = latlng;
        try {
          const areaName = (await reverseGeocode(lat, lng)) || "Custom Pin";
          await userService.setLocation(lat, lng, areaName);
          await refreshUser();
          showToast(`Location set via long press — ${areaName}`);
        } catch {
          showToast("Couldn't set location");
        }
      }, 600);
    };

    const cancelPress = () => {
      if (pressTimeoutRef.current) {
        clearTimeout(pressTimeoutRef.current);
        pressTimeoutRef.current = null;
      }
    };

    const onMouseDown = (e: any) => startPress(e.latlng);
    const onMouseUp = () => cancelPress();
    const onTouchStart = (e: any) => {
      if (e.latlng) startPress(e.latlng);
    };
    const onTouchEnd = () => cancelPress();
    const onTouchMove = () => cancelPress();
    const onDragStart = () => cancelPress();
    const onZoomStart = () => cancelPress();
    const onContextMenu = async (e: any) => {
      cancelPress();
      const { lat, lng } = e.latlng;
      try {
        const areaName = (await reverseGeocode(lat, lng)) || "Custom Pin";
        await userService.setLocation(lat, lng, areaName);
        await refreshUser();
        showToast(`Location set via context menu — ${areaName}`);
      } catch {
        showToast("Couldn't set location");
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
  }, [map, refreshUser, showToast]);

  return null;
}
