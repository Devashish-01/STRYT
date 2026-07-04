import { useCallback, useState } from "react";

import { nativeGeolocation } from "@/lib/nativeGeolocation";

export interface UseGeolocationOptions {
  /** Coords already saved on the user profile (LocationPermission / Settings). */
  storedLat?: number;
  storedLng?: number;
}

// enableHighAccuracy asks for the GPS chip rather than cell-tower/WiFi
// positioning — the latter can be off by hundreds of meters to kilometers,
// which is exactly wrong for a hyperlocal app.
const GEO_OPTS: PositionOptions = { enableHighAccuracy: true, timeout: 10000 };

/**
 * Store-first geolocation (same pattern as AskCompose / StoryCompose):
 * use saved user coords when available, otherwise request browser GPS.
 */
export function useGeolocation(opts: UseGeolocationOptions = {}) {
  const { storedLat = 0, storedLng = 0 } = opts;
  const hasStored = !!(storedLat && storedLng);

  const [lat, setLat] = useState<number | null>(hasStored ? storedLat : null);
  const [lng, setLng] = useState<number | null>(hasStored ? storedLng : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCoords = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setError(null);
  }, []);

  // `force` bypasses the stored-coords shortcut — used by an explicit
  // "re-detect" action, where the user is asking for a fresh GPS fix, not
  // the same value we already have (which may be stale or was wrong).
  const request = useCallback(async (force = false): Promise<{ lat: number; lng: number } | null> => {
    if (!force && storedLat && storedLng) {
      setCoords(storedLat, storedLng);
      return { lat: storedLat, lng: storedLng };
    }

    setLoading(true);
    setError(null);

    return new Promise((resolve) => {
      nativeGeolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(coords.lat, coords.lng);
          setLoading(false);
          resolve(coords);
        },
        () => {
          setLoading(false);
          setError("Couldn't get location");
          resolve(null);
        },
        GEO_OPTS
      );
    });
  }, [storedLat, storedLng, setCoords]);

  return { lat, lng, loading, error, request, setCoords };
}
