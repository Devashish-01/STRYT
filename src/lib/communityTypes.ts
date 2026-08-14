import type { CommunityPostType, AlertSeverity } from "@/types";

/**
 * The single source of truth for community post-type presentation.
 *
 * This metadata used to exist in three places that drifted apart:
 * `COMMUNITY_TYPE_META` in components/cards.tsx (label/emoji/tone),
 * `POST_FILTERS`/`POST_LABELS` in screens/CommunityHub.tsx (filter labels), and
 * a local `types` array in screens/CommunityCompose.tsx (label/emoji/hint).
 * The composer called RECOMMENDATION "Ask neighbors" while the hub filter
 * called it "Ask" and the card called it "Ask neighbors" — the same post read
 * differently depending on which screen you were on. Everything now imports
 * from here.
 */
export interface CommunityTypeMeta {
  type: CommunityPostType;
  /** Badge/filter label — what the post IS. */
  label: string;
  /** Composer tile label — what you're about to DO. */
  action: string;
  emoji: string;
  /** Maps to an existing `.badge-{tone}` class in index.css. */
  tone: "amber" | "red" | "purple" | "green" | "blue";
  /** One-line explanation shown under the composer tile. */
  hint: string;
  titlePlaceholder: string;
  bodyPlaceholder: string;
  /** Whether "Mark resolved" applies — a giveaway/poll/shoutout never had an
   *  outstanding thing to resolve. Mirrors CommunityPostDetail's canMarkResolved. */
  resolvable: boolean;
}

export const COMMUNITY_TYPES: readonly CommunityTypeMeta[] = [
  {
    type: "RECOMMENDATION",
    label: "Ask neighbors",
    action: "Ask neighbors",
    emoji: "💬",
    tone: "purple",
    hint: "Get recommendations for a place or service",
    titlePlaceholder: "e.g. Reliable dentist near KP?",
    bodyPlaceholder: "What are you looking for? Budget, timing, area…",
    resolvable: false,
  },
  {
    type: "LOST_FOUND",
    label: "Lost & Found",
    action: "Lost & Found",
    emoji: "🔍",
    tone: "amber",
    hint: "Report something lost or found nearby",
    titlePlaceholder: "e.g. Lost black wallet near the park",
    bodyPlaceholder: "Describe it — colour, markings, when you noticed…",
    resolvable: true,
  },
  {
    type: "ALERT",
    label: "Alert",
    action: "Post an alert",
    emoji: "📢",
    tone: "red",
    hint: "Water cut, road closed, safety notice",
    titlePlaceholder: "e.g. Water supply cut till 6pm",
    bodyPlaceholder: "What's happening, where, and for how long…",
    resolvable: true,
  },
  {
    type: "GIVEAWAY",
    label: "Giveaway",
    action: "Give something away",
    emoji: "🎁",
    tone: "green",
    hint: "Give away something for free",
    titlePlaceholder: "e.g. Free study table, good condition",
    bodyPlaceholder: "Condition, size, why you're giving it away…",
    resolvable: true,
  },
  {
    type: "POLL",
    label: "Poll",
    action: "Run a poll",
    emoji: "📊",
    tone: "blue",
    hint: "Ask the neighborhood to vote",
    titlePlaceholder: "e.g. Should we add more parking?",
    bodyPlaceholder: "Add context so people can vote well…",
    resolvable: false,
  },
  {
    type: "SHOUTOUT",
    label: "Shoutout",
    action: "Give a shoutout",
    emoji: "🙌",
    tone: "purple",
    hint: "Thank a local business or neighbor",
    titlePlaceholder: "e.g. Huge thanks to the corner bakery",
    bodyPlaceholder: "What did they do that deserves a shoutout?",
    resolvable: false,
  },
] as const;

export const COMMUNITY_TYPE_META: Record<CommunityPostType, CommunityTypeMeta> =
  COMMUNITY_TYPES.reduce((acc, m) => {
    acc[m.type] = m;
    return acc;
  }, {} as Record<CommunityPostType, CommunityTypeMeta>);

/** Feed filter order — "ALL" first, then the same order the composer offers. */
export const POST_FILTERS: readonly ("ALL" | CommunityPostType)[] = [
  "ALL",
  ...COMMUNITY_TYPES.map((m) => m.type),
] as const;

export function filterLabel(f: "ALL" | CommunityPostType): string {
  if (f === "ALL") return "All";
  const m = COMMUNITY_TYPE_META[f];
  return `${m.emoji} ${m.label}`;
}

/**
 * Tolerant lookup for a post type that arrives as a plain string rather than a
 * `CommunityPostType` — some read paths (userService's public-profile summary)
 * pass the raw column through without narrowing it. Falls back to a neutral
 * entry so an unknown value renders as something readable instead of the raw
 * enum, which is what PublicProfile was showing ("LOST_FOUND").
 */
export function postTypeMeta(type: string): CommunityTypeMeta {
  return COMMUNITY_TYPE_META[type as CommunityPostType] ?? {
    type: "RECOMMENDATION",
    label: "Post",
    action: "Post",
    emoji: "💬",
    tone: "purple",
    hint: "",
    titlePlaceholder: "",
    bodyPlaceholder: "",
    resolvable: false,
  };
}

/** Types that carry a photo well enough to justify a prominent picker.
 *  Photos are allowed on EVERY type (Instagram-style, media is universal) —
 *  this only decides which composers lead with the camera. */
export const PHOTO_FORWARD_TYPES: readonly CommunityPostType[] = ["LOST_FOUND", "GIVEAWAY"] as const;

export const ALERT_SEVERITIES: readonly { value: AlertSeverity; label: string; emoji: string; hint: string; tone: "blue" | "amber" | "red"; hours: number }[] = [
  { value: "INFO", label: "Info", emoji: "ℹ️", hint: "Good to know", tone: "blue", hours: 48 },
  { value: "WARNING", label: "Heads up", emoji: "⚠️", hint: "Plan around it", tone: "amber", hours: 24 },
  { value: "URGENT", label: "Urgent", emoji: "🚨", hint: "Act now", tone: "red", hours: 12 },
] as const;

/** Poll durations, Snapchat-style time-boxing: a poll that never closes never
 *  gets a result, and an open-ended poll can't notify its voters (Task 8). */
export const POLL_DURATIONS: readonly { hours: number; label: string }[] = [
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
] as const;

export const DEFAULT_POLL_DURATION_HOURS = 24;

/** Max photos per post. Small on purpose: a neighborhood post is a glance,
 *  not an album, and every extra upload is a slower post on a phone network. */
export const MAX_POST_MEDIA = 4;

export const MAX_TITLE_LEN = 150;
export const MAX_BODY_LEN = 2000;
export const MIN_TITLE_LEN = 4;
export const MAX_POLL_OPTIONS = 4;
export const MIN_POLL_OPTIONS = 2;
