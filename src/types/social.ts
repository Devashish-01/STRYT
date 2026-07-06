// Stories, the community feed, and the trust signals neighbors give each other.

import type { BookmarkTarget } from "./user";

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
  /** Saved past its normal expiry — surfaces in the "Highlights" reel on the author's profile. */
  isHighlighted?: boolean;
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
  /** Raw timestamp behind `postedAt`'s relative label — used for engagement-decay sorting ("Trending nearby"). */
  createdAtISO?: string;
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

export interface LeaderEntry {
  rank: number;
  name: string;
  avatar: string;
  metric: string;
  value: string;
  isProvider: boolean;
  targetId: string;
}

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  unlocked: boolean;
  progress?: number; // 0..1
}
