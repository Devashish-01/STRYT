// "X km" only when we actually have a positive distance — "0 km" reads like a
// bug (provider with no location, or same-point). Falls back to "nearby".
export function distanceLabel(km?: number | null): string {
  return km && km > 0 ? `${km} km` : "nearby";
}
