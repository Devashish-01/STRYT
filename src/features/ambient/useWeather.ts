import { useEffect, useState } from "react";

export interface Weather {
  tempC: number;
  code: number;       // WMO weather code
  isRaining: boolean;
  isHot: boolean;     // >= 35°C
}

const CACHE_KEY = "naya_weather_cache";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface CacheEntry { weather: Weather; ts: number; lat: number; lng: number; }

function readCache(lat: number, lng: number): Weather | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    // Invalidate if too old or location changed significantly (>0.05 deg ≈ 5km)
    if (
      Date.now() - entry.ts > CACHE_TTL ||
      Math.abs(entry.lat - lat) > 0.05 ||
      Math.abs(entry.lng - lng) > 0.05
    ) return null;
    return entry.weather;
  } catch { return null; }
}

function writeCache(lat: number, lng: number, weather: Weather) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ weather, ts: Date.now(), lat, lng }));
  } catch { /* storage quota */ }
}

// WMO codes that indicate rain/precipitation
const RAIN_CODES = new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,85,86,95,96,99]);

export function useWeather(lat?: number, lng?: number): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(() =>
    lat != null && lng != null && (lat !== 0 || lng !== 0) ? readCache(lat, lng) : null
  );

  useEffect(() => {
    if (lat == null || lng == null || (lat === 0 && lng === 0)) return;
    const lLat = lat;
    const lLng = lng;

    const cached = readCache(lLat, lLng);
    if (cached) { setWeather(cached); return; }

    const ctrl = new AbortController();

    async function fetchWeather() {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lLat}&longitude=${lLng}&current=temperature_2m,weather_code&timezone=auto`,
          { signal: ctrl.signal }
        );
        if (!res.ok) return;
        
        const j = await res.json();
        const code: number = j?.current?.weather_code ?? 0;
        const tempC: number = j?.current?.temperature_2m ?? 28;
        const w: Weather = {
          tempC,
          code,
          isRaining: RAIN_CODES.has(code),
          isHot: tempC >= 35,
        };
        writeCache(lLat, lLng, w);
        setWeather(w);
      } catch (err) {
        // fail silently — default Home renders without weather
      }
    }

    void fetchWeather();

    return () => ctrl.abort();
  }, [lat, lng]);

  return weather;
}
