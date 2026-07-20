// The signed-in user, public profiles, and app-wide notification/bookmark
// primitives that don't belong to any single other domain.

export type Role = "customer" | "business_owner" | "provider";

export type BookmarkTarget = "BUSINESS" | "PROVIDER" | "REQUEST";

export type NotificationType =
  | "NEW_BUSINESS"
  | "NEW_PROVIDER"
  | "NEARBY_REQUEST"
  | "PROPOSAL"
  | "AGREEMENT"
  | "OFFER"
  | "ME_TOO"
  | "GROUP_BUY_UNLOCKED"
  | "QUOTE_BROADCAST"
  | "LOCATION_REQUEST"
  | "LOCATION_APPROVED"
  | "COMMUNITY_COMMENT"
  | "REPORT_RESOLVED"
  | "STORY_REACTION"
  | "SAVED_SEARCH_MATCH"
  | "VERIFICATION_DECIDED"
  | "QUEUE_UPDATE"
  | "APPOINTMENT"
  | "BUSINESS_ACCESS"
  | "SYSTEM";

/** Semantic tone for a notification's status pill / accent — maps to the
 *  app's existing semantic color tokens (green/red/amber/blue/purple/gray). */
export type NotificationTone = "success" | "danger" | "warning" | "info" | "brand" | "neutral";

/** Structured, per-type enrichment snapshotted at notification-creation time
 *  (DB trigger or service call) from data that already exists in scope right
 *  then — a proposer's avatar, a deal's ₹ amount, a listing's cover photo,
 *  a verification rejection reason, etc. Deliberately a snapshot, not a live
 *  join: a notification is a historical record, so it should read exactly as
 *  it did when created even if the source entity later changes (same
 *  reasoning as `appointments.customer_avatar` being copied at booking time).
 *  Always optional — every field must degrade gracefully to plain title/body
 *  when absent (older rows, or a type that hasn't been enriched). */
export interface NotificationMetadata {
  /** Person/business/provider avatar or cover photo for a circular treatment. */
  avatarUrl?: string;
  /** A larger photo for a listing-style thumbnail (business/provider/story cover). */
  imageUrl?: string;
  /** Display name of the acting person/entity, when distinct from the title. */
  actorName?: string;
  /** ₹ amount relevant to the notification (quote price, deal value, payment). */
  amount?: number;
  /** Short label paired with `amount`, e.g. "Quoted", "Paid", "Deal value". */
  amountLabel?: string;
  /** Short structured status text, e.g. "Confirmed", "Rejected", "Pending". */
  statusPill?: string;
  /** Semantic tone driving the status pill / accent color. */
  tone?: NotificationTone;
  /** Free-text reason (verification rejection, report outcome, etc.). */
  reason?: string;
  /** A single emoji for lightweight reactions (story reactions, etc.). */
  emoji?: string;
  /** Category label for discovery-type notifications. */
  category?: string;
  /** Group-buy / "me too" progress, e.g. { current: 6, target: 10 }. */
  progressCurrent?: number;
  progressTarget?: number;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink: string;
  isRead: boolean;
  /** Human-friendly relative label, e.g. "2h ago" — for display only. */
  time: string;
  /** Raw ISO timestamp — used for day-grouping (Today/Yesterday/Earlier). */
  createdAt: string;
  /** Present only for notifications created after the metadata column shipped
   *  and enriched by their creation path — see NotificationMetadata. */
  metadata?: NotificationMetadata | null;
}

export interface PublicUser {
  id: string;
  name: string; // real name — shown only where a relationship permits; prefer `alias` publicly
  /** Unique public handle — the identity strangers should see. */
  alias?: string | null;
  phone?: string;
  avatar: string;
  area: string;
  /** Precomputed server-side from the viewer's own coords — never the
   *  target's raw coordinates, see ISS-009. */
  distanceKm?: number;
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
  showEmailPublicly?: boolean;
  showCityPublicly?: boolean;
  showRatingPublicly?: boolean;
  /** Opt-in to showing the real `name` publicly instead of alias/first-name. Defaults false. */
  showNamePublicly?: boolean;
  email?: string;        // present only if the owner made it public
  locationShared?: boolean; // viewer currently has an approved location grant
  locationRequestStatus?: "NONE" | "PENDING" | "APPROVED" | "DENIED";
}

export interface CurrentUser {
  id: string;
  name: string;
  /** Unique public handle — the only identity strangers see; real `name` is private. */
  alias?: string | null;
  phone: string;
  email?: string;
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
  showPostsPublicly?: boolean;
  showAsksPublicly?: boolean;
  showBadgesPublicly?: boolean;
  showPhonePublicly?: boolean;
  showEmailPublicly?: boolean;
  showCityPublicly?: boolean;
  showRatingPublicly?: boolean;
  /** Opt-in to showing the real `name` publicly instead of alias/first-name. Defaults false. */
  showNamePublicly?: boolean;
  locationPublic?: boolean; // global "anyone can see my exact location"
  customerEnabled?: boolean;
  customerDeletedAt?: string | null;
  deletionScheduledAt?: string | null;
  /** Set once the user finishes or explicitly skips first-login onboarding (UserOnboard.tsx). */
  onboardingCompletedAt?: string | null;
  /** Legal version (see lib/legal.ts LEGAL_VERSION) the user last accepted, or
   *  null if never accepted. `undefined` means it couldn't be read (e.g. the
   *  acceptance migration hasn't run) — the app's gate treats that as "unknown"
   *  and does not block, so a client shipped ahead of the migration can't brick. */
  termsAcceptedVersion?: string | null;
  termsAcceptedAt?: string | null;
}
