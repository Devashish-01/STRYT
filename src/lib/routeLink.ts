/**
 * Turn an ordered list of delivery stops into a navigation deep link.
 *
 * The agent console previously only ever navigated to ONE destination at a
 * time, so a rider with five drops had to re-open maps after every stop. These
 * build a single multi-waypoint route instead: the last stop is the
 * destination and everything before it rides along as waypoints, in the order
 * given (the console has already sorted them nearest-neighbour).
 */

export interface RouteStop {
  lat: number;
  lng: number;
}

/**
 * Google Maps' URL API accepts at most 9 intermediate waypoints (the 10th
 * point is the destination). Longer runs are truncated rather than silently
 * producing a URL Maps rejects — callers surface the cap to the agent.
 */
export const MAX_ROUTE_WAYPOINTS = 9;

/** Only stops with real coordinates can be routed to. */
export function routableStops<T extends { deliveryLat: number | null; deliveryLng: number | null }>(
  stops: T[],
): T[] {
  return stops.filter((s) => s.deliveryLat != null && s.deliveryLng != null);
}

/**
 * Build a Google Maps directions URL through every stop in order.
 * Origin is deliberately omitted so Maps starts from the device's live
 * position — the agent is already on the move, and a stale stored origin
 * would route them from where they *were*.
 *
 * Returns null when there's nothing routable.
 */
export function buildRouteUrl(stops: RouteStop[]): string | null {
  if (stops.length === 0) return null;

  // Destination is the final stop; everything before it becomes a waypoint.
  const capped = stops.length > MAX_ROUTE_WAYPOINTS + 1
    ? stops.slice(0, MAX_ROUTE_WAYPOINTS + 1)
    : stops;

  const destination = capped[capped.length - 1];
  const waypoints = capped.slice(0, -1);

  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lng}`,
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    // Maps expects pipe-separated "lat,lng" pairs; URLSearchParams encodes the
    // pipe, which Maps accepts.
    params.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** True when the run is longer than one navigation link can cover. */
export function exceedsRouteCap(stopCount: number): boolean {
  return stopCount > MAX_ROUTE_WAYPOINTS + 1;
}

/** Open a built route in a new tab/the native maps app. No-op if unroutable. */
export function openRoute(stops: RouteStop[]): boolean {
  const url = buildRouteUrl(stops);
  if (!url) return false;
  window.open(url, "_blank", "noopener");
  return true;
}
