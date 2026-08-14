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

/** Who may comment on a post, chosen by the author at compose time.
 *  Replaces the old boolean `allowComments` + hard mutual-follow requirement:
 *  that combination (comments off by default, and even when on only mutual
 *  follows could reply) meant most posts were unanswerable, which is the
 *  single biggest engagement blocker in the community loop.
 *  - EVERYONE  — any signed-in member
 *  - NEIGHBORS — members within the post's own radius (the default)
 *  - MUTUALS   — only neighbors the author follows back (the old behaviour)
 *  - OFF       — nobody; the author is broadcasting only
 *  The author can always comment on their own post regardless of policy.
 *  The client uses this for UX only — `post_comments` RLS is the real gate. */
export type CommentPolicy = "EVERYONE" | "NEIGHBORS" | "MUTUALS" | "OFF";

/** How loud an ALERT post is. Drives the card accent, the notification tone,
 *  and the default auto-expiry window (an alert is news, not an archive). */
export type AlertSeverity = "INFO" | "WARNING" | "URGENT";

/** A business/provider the author explicitly tagged in a post (RECOMMENDATION
 *  / SHOUTOUT). Distinct from `CommunityPost.recommendations`, which is what
 *  *other* neighbors added in response. */
export interface PostTag {
  listingType: "BUSINESS" | "PROVIDER";
  listingId: string;
  name: string;
}

export interface CommunityPost {
  id: string;
  type: CommunityPostType;
  authorName: string;
  authorAvatar: string;
  /** The underlying user who posted (always present, even when posting as business/provider). */
  authorUserId?: string;
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
  /** All photos on the post. `image` stays populated with `media[0]` so every
   *  older render path (cards, profile tabs, notifications) keeps working. */
  media?: string[];
  /** Author-supplied description of the photo, for screen readers. */
  imageAlt?: string;
  likes: number;
  liked: boolean;
  commentsCount: number;
  /** Whether commenting is enabled on this post. Defaults to false (comments off).
   *  @deprecated Superseded by `commentPolicy`; kept because older rows only
   *  have this column. Read `commentPolicy` — it is derived from this when the
   *  newer column is absent. */
  allowComments?: boolean;
  /** Who may comment. Derived from `allow_comments` for pre-migration rows. */
  commentPolicy?: CommentPolicy;
  /** Author chose to keep the like count private (the button still works). */
  hideLikeCount?: boolean;
  /** Whether the viewer has saved/bookmarked this post. */
  saved?: boolean;
  // recommendation answers reference real listings
  recommendations?: { listingType: BookmarkTarget; listingId: string; byName: string }[];
  // poll
  pollOptions?: { id: string; label: string; votes: number }[];
  votedOptionId?: string | null;
  /** When voting closes. Null/absent = open indefinitely (legacy rows). */
  pollEndsAt?: string | null;
  // alert
  resolved?: boolean;
  /** ALERT only — how loud it is. */
  severity?: AlertSeverity | null;
  /** When this post stops surfacing in the feed. Set for time-boxed types
   *  (ALERT, POLL); null for evergreen posts. */
  expiresAt?: string | null;
  /** LOST_FOUND — free-text "last seen near…" the author typed. */
  lastSeen?: string | null;
  /** LOST_FOUND — optional reward note. */
  reward?: string | null;
  /** GIVEAWAY — how/when to collect the item. */
  pickupNote?: string | null;
  /** A business/provider the AUTHOR tagged (vs. neighbor-added `recommendations`). */
  taggedListing?: PostTag | null;
  lat?: number;
  lng?: number;
}

export interface Comment {
  id: string;
  authorName: string;
  authorAvatar: string;
  /** The user who wrote it — needed to link a mention back to a profile and to
   *  know whether the viewer may delete it. */
  authorUserId?: string;
  body: string;
  time: string;
  /** Raw timestamp behind `time`'s relative label — used for comment sorting. */
  createdAtISO?: string;
  /** Set when this comment is a reply to another comment (nested threads). */
  parentId?: string | null;
  listingType?: BookmarkTarget;
  listingId?: string;
  // #8 optional shared phone, surfaced only when the viewer is allowed to see it
  sharedPhone?: string;
  phoneVisibility?: "OWNER" | "PUBLIC";
  /** Resolved @mentions, so the body can render them as profile links. */
  mentions?: { userId: string; alias: string }[];
  /** Reaction tally by emoji, e.g. { "👍": 3 }. */
  reactions?: Record<string, number>;
  /** The emoji the signed-in viewer picked, if any. One per person per comment. */
  myReaction?: string | null;
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
