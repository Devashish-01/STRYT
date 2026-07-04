// Businesses, providers, and everything an owner manages about their listing.

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
  isVerified: boolean;
  broadcastRadius?: number;
  verificationStatus?: VerificationStatus;
  verificationDocumentUrl?: string;
  aadhaarDocUrl?: string;
  panDocUrl?: string;
  tags: string[];
  priceForTwo?: number;
  deliveryTime?: string;
  offerText?: string;
  ownerEnabled?: boolean;
  deletedAt?: string | null;
  upiId?: string;
  catalog: CatalogItem[];
  offers: Offer[];
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  salePrice?: number;
  image: string;
  stockStatus: "IN_STOCK" | "OUT_OF_STOCK" | "LIMITED";
  isVeg?: boolean;
  bestSeller?: boolean;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  code?: string;
  validUntil: string;
}

// ── Trust layer types ──────────────────────────────────────────
export type VerificationTier =
  | "NONE"
  | "DOCS_SUBMITTED"
  | "PAN_VERIFIED"
  | "AADHAAR_VERIFIED"
  | "VERIFIED_PLUS";

export type VerificationDocType = "PAN" | "AADHAAR" | "BACKGROUND";

export interface ProviderVerification {
  id: string;
  providerId: string;
  type: VerificationDocType;
  docUrl?: string;
  verifiedName?: string;
  verifiedDob?: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  createdAt: string;
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
  verificationTier?: VerificationTier;
  isAvailableNow?: boolean;
  availableUntil?: string | null;
  ownerEnabled?: boolean;
  deletedAt?: string | null;
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

export type QueueTokenStatus = "WAITING" | "CALLED" | "SERVED" | "LEFT";

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

export interface TeamMember {
  id: string;
  name: string;
  avatar: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  phone: string;
}

export interface ProviderPackage {
  id: string;
  providerId: string;
  name: string;
  desc: string;
  price: number;
  duration: string;
  instantBook: boolean;
}

export interface BusinessPackage {
  id: string;
  businessId: string;
  name: string;
  desc: string;
  price: number;
  duration?: string;
  instantBook: boolean;
}
