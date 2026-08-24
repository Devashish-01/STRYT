// Bulk booking & bulk buying — the two halves of /bulk.
//
// A BulkDeal is BUSINESS-initiated: a pre-packaged wholesale offer with a
// minimum order quantity and volume tiers, bookable immediately.
//
// A group buy is CUSTOMER-initiated and deliberately NOT a new type — it's a
// RequestPost with isGroupBuy set, so it inherits the existing proposal,
// counter-offer and agreement flow rather than duplicating it. See
// types/requests.ts.

export type FulfillmentType =
  | "ON_SITE_CAMP"
  | "CLINIC_VISIT"
  | "STORE_PICKUP"
  | "CENTRAL_DROP"
  | "DOORSTEP";

export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  ON_SITE_CAMP: "On-site camp / drive",
  CLINIC_VISIT: "Visit clinic or store",
  STORE_PICKUP: "In-store pickup",
  CENTRAL_DROP: "Central society drop-off",
  DOORSTEP: "Doorstep delivery",
};

/** One volume break: buy `minQty` or more, pay `unitPrice` each. */
export interface BulkTier {
  minQty: number;
  unitPrice: number;
}

export interface BulkDeal {
  id: string;
  businessId: string;
  ownerUserId: string;
  catalogItemId?: string | null;
  title: string;
  description?: string | null;
  image?: string | null;
  regularPrice: number;
  /** Minimum order quantity — below this the deal can't be booked at all. */
  moq: number;
  /** Sorted ascending by minQty on read; may be empty (flat bulk price). */
  tiers: BulkTier[];
  availableQuota?: number | null;
  status: string;
  createdAtISO: string;
  /** Joined from businesses for feed display — not a column. */
  businessName?: string | null;
  businessCover?: string | null;
  businessUpiId?: string | null;
  distanceKm?: number;
}

export type GroupBuyTokenStatus = "ISSUED" | "REDEEMED" | "EXPIRED";

/** The QR claim pass issued to each pooled member once the initiator closes
 *  the deal. Minted and redeemed only via SECURITY DEFINER RPCs. */
export interface GroupBuyToken {
  id: string;
  tokenCode: string;
  agreementId: string;
  requestId: string;
  holderUserId: string;
  issuerUserId: string;
  businessId?: string | null;
  quantity: number;
  unitPrice?: number | null;
  itemLabel?: string | null;
  status: GroupBuyTokenStatus;
  redeemedAtISO?: string | null;
  redeemedBy?: string | null;
  validUntilISO?: string | null;
  createdAtISO: string;
  /** Only set for CENTRAL_DROP fulfillment — at a society gate there's no
   *  merchant scanner, so the coordinator reads this short PIN instead. */
  pickupPin?: string | null;
}

/** Server-computed price quote — the authority for what checkout will charge. */
export interface BulkQuote {
  unitPrice: number;
  total: number;
  regularTotal: number;
  saved: number;
  meetsMoq: boolean;
  quotaOk: boolean;
}

export interface GroupBuyRedemptionStats {
  total: number;
  redeemed: number;
  pending: number;
}

/**
 * Resolve the unit price for a quantity against a deal's tier table.
 * Picks the best (highest minQty that still qualifies) tier, falling back to
 * regularPrice when no tier applies. Pure — unit tested.
 */
export function resolveTierPrice(deal: Pick<BulkDeal, "tiers" | "regularPrice">, qty: number): number {
  const applicable = (deal.tiers ?? [])
    .filter((t) => qty >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty);
  return applicable.length > 0 ? applicable[0].unitPrice : deal.regularPrice;
}

/** Total, unit price, and money saved vs buying at the regular price. */
export function calcBulkTotal(deal: Pick<BulkDeal, "tiers" | "regularPrice">, qty: number) {
  const unitPrice = resolveTierPrice(deal, qty);
  const total = unitPrice * qty;
  const regularTotal = deal.regularPrice * qty;
  const saved = Math.max(0, regularTotal - total);
  const savedPercent = regularTotal > 0 ? Math.round((saved / regularTotal) * 100) : 0;
  return { unitPrice, total, regularTotal, saved, savedPercent };
}
