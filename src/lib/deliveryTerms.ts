/**
 * A shop's home-delivery terms and the arithmetic around them. The server (appointment_create, migration 20261001) is the
 * authority — it enforces the minimum, snapshots the fee and flags out-of-area orders — these helpers only let the order
 * sheet show the same numbers before the customer taps "Place order", so keep the two in step.
 */
export interface DeliveryTerms {
  /** Whole rupees. 0 = free delivery. */
  fee: number;
  /** Subtotal at or above which delivery is free. null = never free. */
  freeAbove: number | null;
  /** Whole rupees. 0 = no minimum. */
  minOrder: number;
  /** Own delivery radius. null = follow the shop's reach (broadcast radius). */
  radiusKm: number | null;
  /** Minutes from order to ready-to-ship, used for the ASAP estimate. */
  prepMin: number;
}

export const DEFAULT_DELIVERY_TERMS: DeliveryTerms = { fee: 0, freeAbove: null, minOrder: 0, radiusKm: null, prepMin: 20 };

/** The fee that would be charged for an order worth `subtotal` (before delivery). */
export function deliveryFeeFor(subtotal: number, terms: DeliveryTerms): number {
  if (terms.freeAbove != null && subtotal >= terms.freeAbove) return 0;
  return Math.max(0, terms.fee);
}

/** How much more the customer must add to reach the minimum order; 0 when they have. */
export function minOrderShortfall(subtotal: number, terms: DeliveryTerms): number {
  return terms.minOrder > 0 ? Math.max(0, terms.minOrder - subtotal) : 0;
}

/** How much more to add for free delivery; null when delivery is never free or already is. */
export function freeDeliveryRemaining(subtotal: number, terms: DeliveryTerms): number | null {
  if (terms.freeAbove == null || terms.fee <= 0) return null;
  const left = terms.freeAbove - subtotal;
  return left > 0 ? left : null;
}

/** Great-circle distance in km (haversine). Good to a few metres at delivery scale. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The radius an order is judged against: the shop's own delivery radius, else its reach, else 5 km — the same
 * fallback chain appointment_create uses.
 */
export function effectiveRadiusKm(terms: DeliveryTerms, broadcastRadiusKm: number | null | undefined): number {
  if (terms.radiusKm && terms.radiusKm > 0) return terms.radiusKm;
  if (broadcastRadiusKm && broadcastRadiusKm > 0) return broadcastRadiusKm;
  return 5;
}

/** True when a drop-off is beyond the delivery radius. Unknown positions are never "outside" (the server decides). */
export function isOutsideDeliveryArea(
  shop: { lat?: number | null; lng?: number | null },
  drop: { lat?: number | null; lng?: number | null },
  radiusKm: number,
): boolean {
  if (shop.lat == null || shop.lng == null || drop.lat == null || drop.lng == null) return false;
  return distanceKm({ lat: shop.lat, lng: shop.lng }, { lat: drop.lat, lng: drop.lng }) > radiusKm;
}

/** "About 25 min" from the prep time plus a travel allowance, for the ASAP option. */
export function asapEstimateMin(terms: DeliveryTerms, distanceKmToCustomer: number | null): number {
  const travel = distanceKmToCustomer == null ? 10 : Math.max(5, Math.round(distanceKmToCustomer * 4));
  return Math.max(0, terms.prepMin) + travel;
}

/** Server error codes the order sheet maps to friendly copy. */
export const DELIVERY_ERRORS = ["DELIVERY_MIN_ORDER", "DELIVERY_NOT_OFFERED", "ASAP_REQUIRES_DELIVERY", "DELIVERY_ADDRESS_REQUIRED", "SHOP_CLOSED"] as const;
export type DeliveryErrorCode = (typeof DELIVERY_ERRORS)[number];

export function deliveryErrorCode(message: string | undefined | null): DeliveryErrorCode | null {
  if (!message) return null;
  return DELIVERY_ERRORS.find((c) => message.includes(c)) ?? null;
}

/** A shop's terms from its business row, with the same defaults the database columns have. */
export function termsFromBusiness(b: {
  deliveryFee?: number | null; freeDeliveryAbove?: number | null; minOrderAmount?: number | null;
  deliveryRadiusKm?: number | null; deliveryPrepMin?: number | null;
}): DeliveryTerms {
  return {
    fee: b.deliveryFee ?? 0,
    freeAbove: b.freeDeliveryAbove ?? null,
    minOrder: b.minOrderAmount ?? 0,
    radiusKm: b.deliveryRadiusKm ?? null,
    prepMin: b.deliveryPrepMin ?? 20,
  };
}
