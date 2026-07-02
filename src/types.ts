// Domain types mirrored from PROJECT_SPEC.md §9 (simplified for the frontend).

export type Role = "customer" | "business_owner" | "provider";

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

export type RequestStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "AGREED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export interface RequestPost {
  id: string;
  requesterUserId: string;
  requesterName: string;
  requesterAvatar: string;
  requesterRating: number;
  title: string;
  description: string;
  categoryId: string | null;
  categoryName: string;
  budgetMin?: number;
  budgetMax?: number;
  area: string;
  lat?: number;
  lng?: number;
  distanceKm: number;
  radiusKm: number;
  deadline: string;
  postedAt: string; // relative label
  status: RequestStatus;
  isBoosted: boolean;
  viewCount: number;
  photos: string[];
  proposals: Proposal[];
  // social additions
  meTooCount?: number;
  meTooed?: boolean;
  isGroupBuy?: boolean;
  groupBuyTarget?: number;
  isUrgent?: boolean;
  isRecurring?: boolean;
  isAnonymous?: boolean;
  expiresInHrs?: number;
  liveStatus?: JobLiveStatus;
}

export type ProposalStatus = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

export interface Proposal {
  id: string;
  requestId: string;
  responderUserId: string;
  responderName: string;
  responderAvatar: string;
  responderRating: number;
  responderType: "provider" | "business" | "user";
  responderTagline: string;
  price: number;
  message: string;
  eta: string;
  status: ProposalStatus;
  isBoosted: boolean;
  postedAt: string;
  counters?: ProposalCounter[];
}

export type AgreementStatus =
  | "PENDING"
  | "ACTIVE"
  | "DEPOSIT_PAID"
  | "IN_PROGRESS"
  | "REVIEW"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

export interface Agreement {
  id: string;
  requestId: string;
  requestTitle: string;
  proposalId: string;
  requesterUserId: string;
  responderUserId: string;
  requesterName: string;
  responderName: string;
  responderAvatar: string;
  agreedPrice: number;
  terms: string;
  scheduledFor: string;
  requesterConfirmed: boolean;
  responderConfirmed: boolean;
  paymentMode: "OFFLINE" | "ONLINE";
  status: AgreementStatus;
  createdAt?: string;
  requestArea?: string;
  providerLat?: number;
  providerLng?: number;
  liveStatus?: JobLiveStatus;
  trackingToken?: string;
}

export interface Review {
  id: string;
  raterName: string;
  raterAvatar: string;
  rating: number;
  comment: string;
  date: string;
}

export type NotificationType =
  | "NEW_BUSINESS"
  | "NEW_PROVIDER"
  | "NEARBY_REQUEST"
  | "PROPOSAL"
  | "AGREEMENT"
  | "OFFER"
  | "SYSTEM";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink: string;
  isRead: boolean;
  time: string;
}

export type BookmarkTarget = "BUSINESS" | "PROVIDER" | "REQUEST";

/* ============================================================
   CHAT (R4)
   ============================================================ */

export interface Conversation {
  id: string;
  participantA: string;        // always the lexicographically smaller user ID
  participantB: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  hasUnreadA: boolean;
  hasUnreadB: boolean;
  createdAt: string;
  // Subject the conversation is "about" (a business/provider listing), if any.
  subjectType?: "business" | "provider" | null;
  subjectId?: string | null;
  subjectName?: string | null;
  subjectAvatar?: string | null;
  subjectOwnerId?: string | null;
  // Client-enriched (already resolved to what THIS user should see):
  otherUser?: { id: string; name: string; avatar: string };
}

/** What a new conversation is about — passed when messaging a listing. */
export interface ChatSubject {
  type: "business" | "provider";
  id: string;
  name: string;
  avatar: string;
  ownerUserId: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface FeedItem {
  kind: "business" | "provider" | "request";
  id: string;
  sortDate: number;
}


/* ============================================================
   SOCIAL + COMMUNITY LAYER (Wave additions)
   ============================================================ */

export interface Story {
  id: string;
  businessId?: string;
  providerId?: string;
  userId?: string;
  authorName: string;
  authorAvatar: string;
  authorType: "business" | "provider" | "user";
  image: string;
  caption: string;
  postedAt: string;
  expiresInHrs: number;
  cta: string;
  viewed: boolean;
  tapTarget: string;
  lat?: number;
  lng?: number;
  visibility?: string;
  allowedUserIds?: string[];
  hiddenUserIds?: string[];
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

export interface Vouch {
  byUserId: string;
  byName: string;
  byAvatar: string;
}

export interface Endorsement {
  skill: string;
  count: number;
  endorsed: boolean;
}

export type CommunityPostType =
  | "LOST_FOUND"
  | "ALERT"
  | "RECOMMENDATION"
  | "GIVEAWAY"
  | "POLL"
  | "SHOUTOUT";

export interface CommunityPost {
  id: string;
  type: CommunityPostType;
  authorName: string;
  authorAvatar: string;
  /** Who the post displays as. Absent/"user" = a regular member; "business"/"provider" = posted as that seller identity. */
  authorType?: "user" | "business" | "provider";
  /** The business/provider id when authorType isn't "user". */
  authorRefId?: string;
  title: string;
  body: string;
  area: string;
  distanceKm: number;
  postedAt: string;
  image?: string;
  likes: number;
  liked: boolean;
  commentsCount: number;
  // recommendation answers reference real listings
  recommendations?: { listingType: BookmarkTarget; listingId: string; byName: string }[];
  // poll
  pollOptions?: { id: string; label: string; votes: number }[];
  votedOptionId?: string | null;
  // alert
  resolved?: boolean;
  lat?: number;
  lng?: number;
}

export interface Comment {
  id: string;
  authorName: string;
  authorAvatar: string;
  body: string;
  time: string;
  listingType?: BookmarkTarget;
  listingId?: string;
  // #8 optional shared phone, surfaced only when the viewer is allowed to see it
  sharedPhone?: string;
  phoneVisibility?: "OWNER" | "PUBLIC";
}

export interface SavedList {
  id: string;
  name: string;
  emoji: string;
  items: { type: BookmarkTarget; id: string }[];
  shared: boolean;
}

export interface PublicUser {
  id: string;
  name: string; // public identity: the user's real first name is shown as `name` at render time
  phone?: string;
  avatar: string;
  area: string;
  memberSince: string;
  ratingAvg: number;
  ratingCount: number;
  helpedCount: number;
  requestsCount: number;
  vouchCount: number;
  badges: string[];
  verifications: ("phone" | "id" | "address" | "business")[];
  reviewsGiven: { id: string; target: string; rating: number; comment: string; date: string }[];
  posts?: { id: string; title?: string; body: string; type: string; area?: string; date: string; likesCount: number; commentsCount: number; hiddenOnProfile?: boolean }[];
  requests?: { id: string; categoryName?: string; description: string; status: string; budget?: number; date: string }[];
  proposalsGiven?: { id: string; requestId: string; requestTitle: string; price: number; note: string; date: string }[];
  proposalsReceivedCount?: number;
  showPostsPublicly?: boolean;
  showAsksPublicly?: boolean;
  showBadgesPublicly?: boolean;
  showPhonePublicly?: boolean;
  showCityPublicly?: boolean;
  showRatingPublicly?: boolean;
}

export interface LeaderEntry {
  rank: number;
  name: string;
  avatar: string;
  metric: string;
  value: string;
  isProvider: boolean;
}

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  unlocked: boolean;
  progress?: number; // 0..1
}

export interface Settlement {
  id: string;
  agreementId: string;
  withName: string;
  withAvatar: string;
  amount: number;
  mode: "CASH" | "UPI_OFFLINE";
  note: string;
  date: string;
  tip?: number;
}

export interface NotifySub {
  id: string;
  trigger: "OPENS" | "BACK_IN_STOCK" | "NEW_PROVIDER" | "PRICE_DROP";
  label: string;
  target: string;
}

export interface ProposalCounter {
  id: string;
  by: "requester" | "responder";
  amount: number;
  message: string;
  time: string;
}

export type JobLiveStatus =
  | "CONFIRMED"
  | "LEAVING"
  | "ON_THE_WAY"
  | "ARRIVED"
  | "WORKING"
  | "DONE";

/* ============================================================
   Console / management types (moved here from the old mock
   data files so the app no longer depends on hardcoded seed).
   ============================================================ */

export interface CurrentUser {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  roles: Role[];
  area: string;
  city: string;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
  language: string;
  notificationRadiusKm: number;
  emergencyContact?: string;
  emergencyContactName?: string;
  showPostsPublicly?: boolean;
  showAsksPublicly?: boolean;
  showBadgesPublicly?: boolean;
  showPhonePublicly?: boolean;
  showCityPublicly?: boolean;
  showRatingPublicly?: boolean;
  customerEnabled?: boolean;
  customerDeletedAt?: string | null;
  deletionScheduledAt?: string | null;
}

export interface QnaItem {
  id: string;
  businessId: string;
  askerName: string;
  question: string;
  answer?: string;
  askedAt: string;
}

export interface ReservationReq {
  id: string;
  businessId: string;
  customerName: string;
  customerAvatar: string;
  type: "TABLE" | "PREORDER" | "APPOINTMENT";
  detail: string;
  when: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
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

export interface SosAlert {
  id: string;
  agreementId: string;
  triggeredByUserId: string;
  providerUserId: string;
  lat?: number;
  lng?: number;
  emergencyContact?: string;
  smsSent: boolean;
  resolved: boolean;
  createdAt: string;
}

export interface TrackingToken {
  id: string;
  agreementId: string;
  expiresAt: string;
}

export type AppointmentStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type CancelledBy = "CUSTOMER" | "OWNER" | "SYSTEM";

export type PaymentMethod = "UPI" | "CASH";
export type PaymentStatus = "UNPAID" | "PENDING_CONFIRM" | "PAID" | "REJECTED";

export interface AppointmentRecord {
  id: string;
  targetId: string;
  targetName: string;
  targetAvatar?: string;
  targetType: "PROVIDER" | "BUSINESS";
  customerId: string;
  customerName: string;
  customerAvatar?: string;
  scheduledForISO: string;
  dateLabel: string;
  timeLabel: string;
  notes?: string;
  photoUrl?: string;
  packageId?: string;
  packageName?: string;
  packagePrice?: number;
  status: AppointmentStatus;
  responseNote?: string;
  createdAtISO: string;
  paymentMethod?: PaymentMethod | null;
  paymentStatus?: PaymentStatus;
  paymentAmount?: number | null;
  paymentReference?: string | null;
  cancelledBy?: CancelledBy | null;
  isWalkIn?: boolean;
}

export interface BlockedSlot {
  id: string;
  targetId: string;
  targetType: "PROVIDER" | "BUSINESS";
  date?: string | null;      // YYYY-MM-DD, set when !recurring
  weekday?: number | null;   // 0=Sun..6=Sat, set when recurring
  timeLabel?: string | null; // null = whole day blocked
  reason?: string | null;
  recurring: boolean;
  createdAtISO?: string;
}
