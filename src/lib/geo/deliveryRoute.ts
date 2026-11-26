/**
 * Computes the active road route origin & destination for the delivery map:
 * - While ASSIGNED (pickup phase): if we have a real rider fix away from the store,
 *   route Rider → Store (with a previewLeg Store → Drop-off); if we have no rider
 *   fix yet (or the fix sits at the store), route Store → Drop-off so the rider
 *   still sees the full street path instead of collapsing origin == destination.
 * - Once picked up / EN_ROUTE / ARRIVED: route (Rider ?? Store) → Drop-off.
 */
export function resolveDeliveryRouteEndpoints({
  riderLat,
  riderLng,
  storeLat,
  storeLng,
  destLat,
  destLng,
  status,
}: {
  riderLat?: number | null;
  riderLng?: number | null;
  storeLat?: number | null;
  storeLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  status?: string | null;
}): {
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  previewLeg: [{ lat: number; lng: number }, { lat: number; lng: number }] | null;
} {
  const hasRider = riderLat != null && riderLng != null;
  const hasStore = storeLat != null && storeLng != null;
  const hasDest = destLat != null && destLng != null;
  const isPickupPhase = status === "ASSIGNED" && hasStore;

  if (isPickupPhase) {
    const riderAtStore =
      hasRider &&
      Math.abs(riderLat! - storeLat!) < 0.0001 &&
      Math.abs(riderLng! - storeLng!) < 0.0001;

    if (hasRider && !riderAtStore) {
      return {
        origin: { lat: riderLat!, lng: riderLng! },
        destination: { lat: storeLat!, lng: storeLng! },
        previewLeg: hasDest
          ? [{ lat: storeLat!, lng: storeLng! }, { lat: destLat!, lng: destLng! }]
          : null,
      };
    }

    if (hasDest) {
      return {
        origin: { lat: storeLat!, lng: storeLng! },
        destination: { lat: destLat!, lng: destLng! },
        previewLeg: null,
      };
    }

    return { origin: null, destination: null, previewLeg: null };
  }

  const origin = hasRider
    ? { lat: riderLat!, lng: riderLng! }
    : hasStore
    ? { lat: storeLat!, lng: storeLng! }
    : null;
  const destination = hasDest
    ? { lat: destLat!, lng: destLng! }
    : hasStore
    ? { lat: storeLat!, lng: storeLng! }
    : null;

  return { origin, destination, previewLeg: null };
}
