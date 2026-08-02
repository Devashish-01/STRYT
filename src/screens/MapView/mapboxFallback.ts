import type { RequestParameters, RequestTransformFunction } from "maplibre-gl";

// Set once per app session (cleared on a fresh launch/reload from zero,
// per-tab in a browser) the first time Mapbox fails to load — so a user who
// hits a bad Mapbox moment (or an exhausted usage cap) doesn't eat a fresh
// multi-second wait on every subsequent map open in that same session. A new
// session always tries Mapbox again in case whatever went wrong has cleared.
const FALLBACK_KEY = "stryt_mapbox_fallback";

export function hasMapboxFallenBackThisSession(): boolean {
  try {
    return sessionStorage.getItem(FALLBACK_KEY) === "true";
  } catch {
    // Private-browsing / storage-disabled — fail open (try Mapbox) rather
    // than silently pinning every user to the free map forever.
    return false;
  }
}

export function clearMapboxFallbackSession(): void {
  try {
    sessionStorage.removeItem(FALLBACK_KEY);
  } catch { /* best-effort */ }
}

/** True when Mapbox should be the initial basemap for this map open. */
export function shouldAttemptMapbox(token: string): boolean {
  if (!token) return false;
  // Local dev: always retry Mapbox when a token is configured — avoids a
  // stale sessionStorage flag (e.g. from React Strict Mode double-mount) pinning
  // developers to the free tiles for the whole tab session.
  if (import.meta.env.DEV) return true;
  return !hasMapboxFallenBackThisSession();
}

export function mapboxStyleUrl(token: string): string {
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=${token}`;
}

export function rememberMapboxFallback(): void {
  try {
    sessionStorage.setItem(FALLBACK_KEY, "true");
  } catch {
    /* best-effort — a missed write just means this session might retry
       Mapbox once more than strictly necessary, not a functional problem. */
  }
}

function appendToken(url: string, token: string): string {
  return url + (url.includes("?") ? "&" : "?") + `access_token=${token}`;
}

/**
 * Mapbox's own hosted styles reference their sprite/font/vector-tile
 * sub-resources with Mapbox's proprietary `mapbox://` scheme (e.g.
 * "mapbox://sprites/mapbox/light-v11"). Only the actual `mapbox-gl` library
 * (not installed here — this app renders with the open-source `maplibre-gl`)
 * knows how to resolve that scheme internally. Without this, the top-level
 * style JSON fetches fine and `onLoad` can even fire, but sprites/icons and
 * text labels silently fail to load underneath it.
 *
 * `transformRequest` is maplibre-gl's documented hook for exactly this case:
 * rewrite each `mapbox://...` reference to the equivalent plain HTTPS Mapbox
 * REST endpoint, with the token attached. Everything else (the plain https://
 * style URL we request ourselves, and the free OpenFreeMap style/tiles) is
 * untouched — returning `undefined` tells maplibre-gl to use the original URL.
 */
export function makeMapboxTransformRequest(token: string): RequestTransformFunction {
  return (url: string): RequestParameters | undefined => {
    if (!url.startsWith("mapbox://")) return undefined;

    if (url.startsWith("mapbox://fonts/")) {
      return { url: appendToken(url.replace("mapbox://fonts/", "https://api.mapbox.com/fonts/v1/"), token) };
    }
    if (url.startsWith("mapbox://sprites/")) {
      return { url: appendToken(url.replace("mapbox://sprites/", "https://api.mapbox.com/styles/v1/"), token) };
    }
    if (url.startsWith("mapbox://styles/")) {
      return { url: appendToken(url.replace("mapbox://styles/", "https://api.mapbox.com/styles/v1/"), token) };
    }
    // A vector-tile SOURCE reference, e.g. "mapbox://mapbox.mapbox-streets-v8"
    // — resolves to Mapbox's TileJSON metadata endpoint, which maplibre-gl
    // fetches to discover the real (already-https, self-sufficient) tile URL
    // template for the actual tile requests that follow.
    const tilesetId = url.replace("mapbox://", "");
    return { url: appendToken(`https://api.mapbox.com/v4/${tilesetId}.json`, token) + "&secure" };
  };
}
