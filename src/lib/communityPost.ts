import type { AlertSeverity, CommunityPost, CommunityPostType, PostTag } from "@/types";
import type { CommunityDraft } from "./communityDraft";
import { ALERT_SEVERITIES, MAX_POST_MEDIA } from "./communityTypes";

/**
 * Pure translation between the composer's draft and what actually gets written
 * to `community_posts`, plus the media-list operations the composer performs.
 *
 * This lives outside both the screen and the service on purpose: "which fields
 * belong to which post type" is the rule most likely to drift as types are
 * added, and it's the rule a unit test can pin down exactly. The composer
 * shouldn't be the thing that remembers that a SHOUTOUT must not carry a poll
 * end time.
 */

/* ------------------------------------------------------------------ *
 * Media list operations
 * ------------------------------------------------------------------ */

export interface MediaAddResult {
  media: string[];
  /** Set when the add was refused, for a toast. Null on success. */
  rejected: "AT_LIMIT" | "DUPLICATE" | null;
}

/**
 * Append an uploaded photo URL. Refuses silently-wrong outcomes: going over the
 * cap, or double-adding the same upload (a double-tap on "Gallery" can fire the
 * change handler twice with the same file).
 */
export function addMedia(current: string[], url: string, max: number = MAX_POST_MEDIA): MediaAddResult {
  if (current.includes(url)) return { media: current, rejected: "DUPLICATE" };
  if (current.length >= max) return { media: current, rejected: "AT_LIMIT" };
  return { media: [...current, url], rejected: null };
}

export function removeMediaAt(current: string[], index: number): string[] {
  if (index < 0 || index >= current.length) return current;
  return current.filter((_, i) => i !== index);
}

/** Move a photo to the front — it becomes the card's cover and the legacy
 *  `image` column, so which one leads is a real editorial choice. */
export function promoteMediaToCover(current: string[], index: number): string[] {
  if (index <= 0 || index >= current.length) return current;
  const picked = current[index];
  return [picked, ...current.filter((_, i) => i !== index)];
}

export function canAddMedia(current: string[], max: number = MAX_POST_MEDIA): boolean {
  return current.length < max;
}

/* ------------------------------------------------------------------ *
 * Expiry
 * ------------------------------------------------------------------ */

export function alertExpiryHours(severity: AlertSeverity): number {
  return ALERT_SEVERITIES.find((s) => s.value === severity)?.hours ?? 24;
}

/**
 * When a post should stop surfacing, or null for evergreen types.
 * ALERT expires sooner the louder it is (an "urgent" notice that lingers for
 * two days stops reading as urgent); a POLL expires when voting closes.
 */
export function computeExpiry(draft: CommunityDraft, now: number = Date.now()): { expiresAt: string | null; pollEndsAt: string | null } {
  if (draft.type === "ALERT" && draft.severity) {
    const hours = alertExpiryHours(draft.severity);
    return { expiresAt: new Date(now + hours * 3600_000).toISOString(), pollEndsAt: null };
  }
  if (draft.type === "POLL") {
    const ends = new Date(now + draft.pollDurationHours * 3600_000).toISOString();
    // A poll's expiry and its close time are the same moment: once voting is
    // shut, the post has said everything it is going to say.
    return { expiresAt: ends, pollEndsAt: ends };
  }
  return { expiresAt: null, pollEndsAt: null };
}

/* ------------------------------------------------------------------ *
 * Draft → create payload
 * ------------------------------------------------------------------ */

export interface CreatePostInput {
  type: CommunityPostType;
  title: string;
  body: string;
  image?: string;
  media: string[];
  imageAlt?: string;
  pollOptions?: { id: string; label: string; votes: number }[];
  pollEndsAt: string | null;
  severity: AlertSeverity | null;
  expiresAt: string | null;
  lastSeen: string | null;
  reward: string | null;
  pickupNote: string | null;
  taggedListing: PostTag | null;
}

/** Trim, and collapse an all-whitespace value to null so the DB never stores
 *  a field that renders as an empty row in the UI. */
function clean(v: string): string | null {
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Build exactly the fields this post type should carry. Fields belonging to
 * other types are explicitly nulled rather than omitted, so switching type
 * mid-compose can't smuggle a stale value through (pick POLL, add options,
 * switch to SHOUTOUT — the options must not travel).
 */
export function draftToCreateInput(draft: CommunityDraft, now: number = Date.now()): CreatePostInput {
  if (!draft.type) throw new Error("draftToCreateInput called without a post type");
  const type = draft.type;
  const { expiresAt, pollEndsAt } = computeExpiry(draft, now);
  const media = draft.media.slice(0, MAX_POST_MEDIA);

  return {
    type,
    title: draft.title.trim(),
    body: draft.body.trim(),
    // Kept in step with media[0] so the legacy `image` column and the new
    // array can never disagree about the cover photo.
    image: media[0],
    media,
    imageAlt: media.length > 0 ? clean(draft.imageAlt) ?? undefined : undefined,
    pollOptions: type === "POLL"
      ? draft.pollOptions
          .map((label) => label.trim())
          .filter((label) => label.length > 0)
          .map((label, i) => ({ id: `o${i}`, label, votes: 0 }))
      : undefined,
    pollEndsAt,
    severity: type === "ALERT" ? draft.severity : null,
    expiresAt,
    lastSeen: type === "LOST_FOUND" ? clean(draft.lastSeen) : null,
    reward: type === "LOST_FOUND" ? clean(draft.reward) : null,
    pickupNote: type === "GIVEAWAY" ? clean(draft.pickupNote) : null,
    taggedListing: type === "RECOMMENDATION" || type === "SHOUTOUT" ? draft.taggedListing : null,
  };
}

/* ------------------------------------------------------------------ *
 * Draft → preview
 * ------------------------------------------------------------------ */

/** Sentinel id for the not-yet-saved post shown in the preview sheet. Anything
 *  that could navigate or write is disabled there, but a recognisable id makes
 *  an accidental request obvious in a log rather than mysterious. */
export const PREVIEW_POST_ID = "__preview__";

export interface PreviewIdentity {
  authorName: string;
  authorAvatar?: string;
  authorUserId?: string;
  authorType?: "user" | "business" | "provider";
  authorRefId?: string;
}

/**
 * Build a `CommunityPost` from the draft so the preview can render the REAL
 * `CommunityCard` rather than a lookalike.
 *
 * A hand-built preview is the thing most likely to quietly stop matching: the
 * card gained a severity badge, a photo counter and a poll countdown in Task 2,
 * and a mock would have shown none of them. Reusing the card means the preview
 * is wrong only if the feed is also wrong.
 */
export function draftToPreviewPost(
  draft: CommunityDraft,
  identity: PreviewIdentity,
  area: string,
  now: number = Date.now()
): CommunityPost {
  const input = draftToCreateInput(draft, now);
  return {
    id: PREVIEW_POST_ID,
    type: input.type,
    authorName: identity.authorName,
    authorAvatar: identity.authorAvatar ?? "",
    authorUserId: identity.authorUserId,
    authorType: identity.authorType ?? "user",
    authorRefId: identity.authorRefId,
    title: input.title,
    body: input.body,
    area,
    distanceKm: 0,
    postedAt: "just now",
    createdAtISO: new Date(now).toISOString(),
    image: input.image,
    media: input.media,
    imageAlt: input.imageAlt,
    likes: 0,
    liked: false,
    commentsCount: 0,
    commentPolicy: draft.commentPolicy,
    hideLikeCount: draft.hideLikeCount,
    allowComments: draft.commentPolicy !== "OFF",
    pollOptions: input.pollOptions,
    votedOptionId: null,
    pollEndsAt: input.pollEndsAt,
    resolved: false,
    severity: input.severity,
    expiresAt: input.expiresAt,
    lastSeen: input.lastSeen,
    reward: input.reward,
    pickupNote: input.pickupNote,
    taggedListing: input.taggedListing,
    // Neighbor-added recommendations can't exist before the post does.
    recommendations: undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

/** Photos to render, tolerating the three shapes a post can arrive in: new
 *  (`media`), legacy (`image` only), and mid-migration (both). */
export function postMedia(post: Pick<CommunityPost, "media" | "image">): string[] {
  if (post.media && post.media.length > 0) return post.media;
  if (post.image) return [post.image];
  return [];
}

/** Whether a time-boxed post has run out. Read at render time as well as in
 *  the feed query — a post can expire while the feed sits open. */
export function isExpired(post: Pick<CommunityPost, "expiresAt">, now: number = Date.now()): boolean {
  if (!post.expiresAt) return false;
  const t = Date.parse(post.expiresAt);
  return Number.isFinite(t) && t <= now;
}

export function isPollClosed(post: Pick<CommunityPost, "pollEndsAt">, now: number = Date.now()): boolean {
  if (!post.pollEndsAt) return false;
  const t = Date.parse(post.pollEndsAt);
  return Number.isFinite(t) && t <= now;
}

/**
 * "Ends in 3h" / "Ended" for a countdown pill. Deliberately coarse — a
 * to-the-second timer on a neighborhood poll adds pressure without adding
 * information.
 */
export function timeLeftLabel(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ms = t - now;
  if (ms <= 0) return "Ended";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h left`;
  const days = Math.floor(hrs / 24);
  return `${days}d left`;
}

export const SEVERITY_TONE: Record<AlertSeverity, "blue" | "amber" | "red"> = {
  INFO: "blue",
  WARNING: "amber",
  URGENT: "red",
};

export function severityMeta(severity: AlertSeverity) {
  return ALERT_SEVERITIES.find((s) => s.value === severity) ?? ALERT_SEVERITIES[0];
}
