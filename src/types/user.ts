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

export interface PublicUser {
  id: string;
  name: string; // public identity: the user's real first name is shown as `name` at render time
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
  email?: string;        // present only if the owner made it public
  locationShared?: boolean; // viewer currently has an approved location grant
  locationRequestStatus?: "NONE" | "PENDING" | "APPROVED" | "DENIED";
}

export interface CurrentUser {
  id: string;
  name: string;
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
  emergencyContact?: string;
  emergencyContactName?: string;
  showPostsPublicly?: boolean;
  showAsksPublicly?: boolean;
  showBadgesPublicly?: boolean;
  showPhonePublicly?: boolean;
  showEmailPublicly?: boolean;
  showCityPublicly?: boolean;
  showRatingPublicly?: boolean;
  locationPublic?: boolean; // global "anyone can see my exact location"
  customerEnabled?: boolean;
  customerDeletedAt?: string | null;
  deletionScheduledAt?: string | null;
  /** Set once the user finishes or explicitly skips first-login onboarding (UserOnboard.tsx). */
  onboardingCompletedAt?: string | null;
}
