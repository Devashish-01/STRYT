// Businesses, providers, and everything an owner manages about their listing.

import type { PaymentMethod, PaymentStatus } from "./console";

export type CategoryKind = "BUSINESS" | "SERVICE" | "BOTH";

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  kind: CategoryKind;
  icon: string; // emoji for the mock UI
  color: string;
  children?: Category[];
}

export type EntityStatus =
  | "DRAFT"
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";

export type VerificationStatus = "NONE" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

export interface Business {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  categoryId: string;
  categoryName: string;
  subCategory: string;
  description: string;
  addressLine1: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  distanceKm: number;
  phone: string;
  email?: string;
  showPhonePublicly?: boolean;
  showEmailPublicly?: boolean;
  locationPublic?: boolean;
  whatsapp?: string;
  hours: string;
  specialHours?: { date: string; note: string }[];
  isOpenNow: boolean;
  isAvailableNow?: boolean;
  availableUntil?: string | null;
  openingDate: string; // ISO
  isNew: boolean; // opened in last 7 days
  status: EntityStatus;
  coverImage: string;
  gallery: string[];
  ratingAvg: number;
  ratingCount: number;
  viewCount: number;
  isFeatured: boolean;
  /** Paid placement (boosts table) — MUST be labeled "Promoted" wherever it affects ranking. */
  isBoosted?: boolean;
  boostedUntil?: string | null;
  boostReminderSent?: boolean;
  isVerified: boolean;
  broadcastRadius?: number;
  verificationStatus?: VerificationStatus;
  verificationDocumentUrl?: string;
  /** Private-bucket storage paths for all submitted verification docs (manual review only). */
  verificationDocuments?: string[];
  /** Reviewer's note — set on REJECTED, shown to the owner so they know what to fix. */
  verificationReason?: string;
  verificationReviewedAt?: string | null;
  verificationReviewedBy?: string | null;
  tags: string[];
  priceForTwo?: number;
  deliveryTime?: string;
  /** Owner opt-in for home delivery (Business → Settings). Gates the DELIVERY
   *  option in the booking sheet; also enforced server-side in appointment_create. */
  deliveryEnabled?: boolean;
  /** Fallback bookings-per-slot for catalogue items with no capacity of their
   *  own, and for cart/no-service bookings. 1 = the classic one-at-a-time rule. */
  defaultSlotCapacity?: number;
  /** Optional ceiling across ALL services at one timestamp — stops per-service
   *  capacity overbooking a shared resource (3 chairs, 2 services). Null = off. */
  maxConcurrentBookings?: number | null;
  offerText?: string;
  ownerEnabled?: boolean;
  deletedAt?: string | null;
  upiId?: string;
  /** When appointment payment is collected — before accept, or the current default (accept first, pay around service). */
  paymentTiming?: "AT_BOOKING" | "AT_APPOINTMENT";
  /** Upfront deposit percentage (0–100) collected at booking when paymentTiming is AT_BOOKING; 0/undefined = full amount up front. */
  depositPercent?: number;
  catalog: CatalogItem[];
  /** Past-work gallery shown on the public profile — mirrors the provider portfolio. */
  portfolio?: PortfolioItem[];
  /** The owner's own confirmed/overridden Business Package (src/lib/businessPackages.ts) —
   *  null/undefined means "not chosen yet", so resolvePackage() falls back to
   *  deriving one from categoryName/subCategory. */
  packageKey?: string | null;
  /** Whether this business takes bookings at all. Null = inherit the resolved
   *  package's own default (most do; a pure retail shop typically doesn't).
   *  Distinct from `isOpenNow`, which is a TEMPORARY pause, not a structural
   *  "this business type doesn't take bookings" — never conflate the two. */
  bookingsEnabled?: boolean | null;
}

export type PlaceCategory = "MOUNTAIN" | "TREK" | "SPORTS_VENUE" | "TOURIST_SPOT" | "OTHER";
export type PlaceDifficulty = "EASY" | "MODERATE" | "HARD";

// Staff-curated (or user-suggested, pending review) point of interest shown
// on the Map — no booking/catalog/payment, just discovery info.
export interface Place {
  id: string;
  submittedByUserId: string;
  name: string;
  category: PlaceCategory;
  description?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  coverImage?: string | null;
  gallery: string[];
  status: EntityStatus;
  rejectionReason?: string | null;
  createdAtISO: string;
  distanceKm?: number;
  /** When to go — season, time of day. Free text, e.g. "Oct-Feb, early morning". */
  bestTimeToVisit?: string | null;
  /** "Free", or an actual price string — free text so it can say "₹20 per person" etc. */
  entryFee?: string | null;
  openingHours?: string | null;
  /** How long people typically spend there, e.g. "1-2 hours". */
  visitDuration?: string | null;
  /** Mainly relevant for TREK/MOUNTAIN, but not restricted to those categories. */
  difficulty?: PlaceDifficulty | null;
  /** Transport/route guidance — own vehicle, bus, auto, etc. */
  howToReach?: string | null;
  parkingInfo?: string | null;
  distanceFromCityKm?: number | null;
  /** Real precautions specific to this place — e.g. drowning risk at a
   *  waterfall during monsoon, not generic filler. */
  safetyTips?: string | null;
  /** Seasonal note, e.g. a waterfall that dries up outside monsoon. */
  weatherNote?: string | null;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  salePrice?: number;
  image: string;
  stockStatus: "IN_STOCK" | "OUT_OF_STOCK" | "LIMITED";
  /** Whether this listing is a food item at all — gates whether isVeg applies/shows. */
  isFood?: boolean;
  /** Only meaningful when isFood is true; nullable so a non-food edit can clear a stale value. */
  isVeg?: boolean | null;
  bestSeller?: boolean;
  /** 'INFINITE' = always available (services); 'FINITE' = tracked stock that decrements per booking and auto-hides at zero. */
  inventoryType?: "INFINITE" | "FINITE";
  /** Remaining units for a FINITE item (null/undefined for INFINITE). */
  quantity?: number | null;
  /** How many bookings this service can take at the SAME time slot. Null →
   *  falls back to the business's `defaultSlotCapacity`. Distinct from
   *  `quantity`, which is stock across all time. */
  slotCapacity?: number | null;
  /** How many spots one customer may take in a single booking (party size). */
  maxPartySize?: number;
}

export interface Provider {
  id: string;
  userId: string;
  displayName: string;
  categoryId: string;
  categoryName: string;
  subCategory?: string;
  bio: string;
  avatar: string;
  lat: number;
  lng: number;
  distanceKm: number;
  serviceRadiusKm: number;
  startingPrice: number;
  availabilityNote: string;
  status: EntityStatus;
  isVerified: boolean;
  verificationStatus?: VerificationStatus;
  verificationDocumentUrl?: string;
  /** Private-bucket storage paths for all submitted verification docs (manual review only). */
  verificationDocuments?: string[];
  /** Reviewer's note — set on REJECTED, shown to the owner so they know what to fix. */
  verificationReason?: string;
  verificationReviewedAt?: string | null;
  verificationReviewedBy?: string | null;
  ratingAvg: number;
  ratingCount: number;
  jobsDone: number;
  responseTime: string;
  isNew: boolean;
  skills: string[];
  portfolio: PortfolioItem[];
  phone: string;
  email?: string;
  upiId?: string;
  showPhonePublicly?: boolean;
  showEmailPublicly?: boolean;
  locationPublic?: boolean;
  isAvailableNow?: boolean;
  availableUntil?: string | null;
  /** When false, new appointment bookings are paused (distinct from isAvailableNow). */
  isOpenNow?: boolean;
  ownerEnabled?: boolean;
  deletedAt?: string | null;
  /** When appointment payment is collected — before accept, or the current default (accept first, pay around service). */
  paymentTiming?: "AT_BOOKING" | "AT_APPOINTMENT";
  /** Upfront deposit percentage (0–100) collected at booking when paymentTiming is AT_BOOKING; 0/undefined = full amount up front. */
  depositPercent?: number;
  catalog: CatalogItem[];
  /** The provider's own confirmed/overridden Business Package (src/lib/businessPackages.ts) —
   *  null/undefined means "not chosen yet", so resolvePackage() falls back to
   *  deriving one from categoryName/subCategory. */
  packageKey?: string | null;
  /** Whether this provider takes bookings at all. Null = inherit the resolved
   *  package's own default. Distinct from `isOpenNow`, which is a TEMPORARY pause. */
  bookingsEnabled?: boolean | null;
}

export interface PortfolioItem {
  id: string;
  url: string;
  caption: string;
}

export interface AvailableNow {
  providerId: string;
  availableUntil: string; // label e.g. "3:30 PM"
  minutesLeft: number;
  note: string;
  displayName?: string;
  avatar?: string;
  categoryName?: string;
  distanceKm?: number;
  startingPrice?: number;
  phone?: string;
  ratingAvg?: number;
  isVerified?: boolean;
}

export interface QueueInfo {
  businessId: string;
  peopleAhead: number;
  estWaitMin: number;
  isOpen: boolean;
}

// EXPIRED = ended by the shop/system (auto-close, daily rollover, stale cap);
// LEFT = the customer cancelled themselves. Kept distinct so history reads honestly.
export type QueueTokenStatus = "WAITING" | "CALLED" | "SERVED" | "LEFT" | "EXPIRED";

export interface MyQueueEntry {
  tokenId: string;
  businessId: string;
  businessName: string;
  businessImage: string;
  status: QueueTokenStatus;
  position: number;
  peopleAhead: number;
  partySize: string;
  joinedAtISO: string;
  /** Estimated minutes until this customer is called (peopleAhead × avg service time). */
  estWaitMin?: number;
  /** Business's UPI ID, for the payment QR — queue tokens have no catalog price, so amount is always entered freeform. */
  businessUpiId?: string | null;
  paymentMethod?: PaymentMethod | null;
  paymentStatus?: PaymentStatus;
  paymentAmount?: number | null;
  paymentReference?: string | null;
}

/** A queue token as seen by the business owner console (QueueManager). */
export interface QueueOwnerToken {
  id: string;
  name: string;
  partySize: string;
  joinedAtISO: string;
  /** Set once the business confirms the customer has physically shown up — independent
   *  of "Done" (service complete), so a no-show can be told apart from a completed visit. */
  arrivedAt?: string | null;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  paymentAmount?: number | null;
  paymentReference?: string | null;
}

/** A past queue token (SERVED/LEFT/EXPIRED) shown in the owner's queue history. */
export interface QueueHistoryToken {
  id: string;
  name: string;
  partySize: string;
  joinedAtISO: string;
  status: QueueTokenStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  paymentAmount?: number | null;
}

export interface LoyaltyCard {
  id: string;
  businessId: string;
  businessName: string;
  businessImage: string;
  stamps: number;
  target: number;
  reward: string;
}

export interface Coupon {
  id: string;
  businessId: string;
  businessName: string;
  title: string;
  code: string;
  validUntil: string;
  saved: boolean;
}

export interface QnaItem {
  id: string;
  businessId: string;
  askerName: string;
  question: string;
  answer?: string;
  askedAt: string;
  upvotes: number;
  upvoted: boolean;
}

export interface Lead {
  id: string;
  businessId?: string;
  providerId?: string;
  kind: "CALL" | "DIRECTIONS" | "STORY_REPLY" | "OFFER_CLIP" | "RESERVATION" | "QUESTION" | "MESSAGE";
  name: string;
  avatar: string;
  text: string;
  time: string;
  handled: boolean;
}

