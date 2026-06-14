import { useCallback, useState } from "react";

export interface UseGeolocationOptions {
  /** Coords already saved on the user profile (LocationPermission / Settings). */
  storedLat?: number;
  storedLng?: number;
}

const GEO_OPTS: PositionOptions = { enableHighAccuracy: false, timeout: 10000 };

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

  const request = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    if (storedLat && storedLng) {
      setCoords(storedLat, storedLng);
      return { lat: storedLat, lng: storedLng };
    }

    if (!navigator.geolocation) {
      setError("GPS not available on this device");
      return null;
    }

    setLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
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
