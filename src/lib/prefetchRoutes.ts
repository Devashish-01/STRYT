/**
 * Warm heavy route chunks before the user asks for them.
 *
 * The map is by far the worst offender: opening /map pulls `maplibre-gl`
 * (~1.0 MB raw / 277 KB gzipped) plus the map vendor chunk (~152 KB / 43 KB),
 * none of which is fetched until the moment the Map tab is tapped. On a
 * mid-range Android that is a network round trip AND several hundred ms of
 * JS parse/compile before the first tile can even be requested — which is
 * exactly the "map takes longer to open than it should" delay.
 *
 * Prefetching turns that into a background download that has usually finished
 * before the tap, so the chunk comes from cache and the map renders promptly.
 * Nothing here changes what the app does — only when the bytes arrive.
 *
 * The import specifier MUST stay resolvable to the same module as the
 * `lazy(() => import("./screens/MapView"))` in App.tsx, or Vite emits a second
 * copy of the chunk and the prefetch warms the wrong file.
 */

let mapPrefetched = false;

/**
 * True when we should NOT spend a megabyte of someone's data speculatively:
 * an explicit Data Saver request, or a connection slow enough that the
 * prefetch would compete with whatever the user is actually looking at.
 */
function shouldSkipPrefetch(): boolean {
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!conn) return false; // unknown (Safari/iOS) — assume it's fine
  if (conn.saveData) return true;
  return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
}

/**
 * Fetch the MapView chunk in the background. Safe to call repeatedly and from
 * anywhere — it runs at most once, and a failure is swallowed: this is pure
 * optimisation, so a prefetch that fails must never surface to the user or
 * break the real navigation that follows.
 */
export function prefetchMapView(): void {
  if (mapPrefetched || typeof window === "undefined") return;
  if (shouldSkipPrefetch()) return;
  mapPrefetched = true;
  void import("../screens/MapView").catch(() => {
    // Offline or the chunk 404s after a deploy — let the real navigation
    // retry and surface any error through the normal Suspense path.
    mapPrefetched = false;
  });
}

/**
 * Kick off idle-time prefetching once the app has settled.
 *
 * `requestIdleCallback` keeps this behind first paint and any in-flight work,
 * so warming the map never competes with rendering Home. Safari has no
 * `requestIdleCallback`, hence the timeout fallback.
 */
export function schedulePrefetch(): void {
  if (typeof window === "undefined") return;
  const idle = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
    .requestIdleCallback;
  if (idle) idle(() => prefetchMapView(), { timeout: 4000 });
  else window.setTimeout(prefetchMapView, 2000);
}
