import type { AlertSeverity, CommentPolicy, CommunityPostType, PostTag } from "@/types";
import {
  DEFAULT_POLL_DURATION_HOURS,
  MAX_POST_MEDIA,
  MIN_POLL_OPTIONS,
  MIN_TITLE_LEN,
} from "./communityTypes";

/**
 * Draft persistence + validation for the community composer, kept free of React
 * and of `localStorage` so it can be unit-tested (vitest runs in a node
 * environment, where there is no DOM storage) and so the composer screen stays
 * presentational.
 *
 * Why drafts at all: composing a post is the one place in the app where a user
 * types something long enough to lose. Any interruption — a call, a tab switch,
 * the OS reclaiming the webview — silently discarded it, and the seller-identity
 * resolution the composer waits on makes that window longer than it looks.
 */

/** Bump when the draft shape changes incompatibly — older payloads are then
 *  dropped rather than half-restored into fields that no longer exist. */
export const DRAFT_VERSION = 2;

/** A draft older than this is stale enough that restoring it would confuse
 *  rather than help ("why is last week's post in my composer?"). */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DRAFT_KEY_PREFIX = "stryt_community_draft";

export interface CommunityDraft {
  version: number;
  type: CommunityPostType | null;
  title: string;
  body: string;
  /** Uploaded photo URLs (upload happens immediately, so a restored draft
   *  keeps its images without re-picking them from the gallery). */
  media: string[];
  imageAlt: string;
  pollOptions: string[];
  pollDurationHours: number;
  severity: AlertSeverity | null;
  lastSeen: string;
  reward: string;
  pickupNote: string;
  taggedListing: PostTag | null;
  commentPolicy: CommentPolicy;
  hideLikeCount: boolean;
  /** Epoch ms of the last save — drives TTL expiry and the "Draft saved" hint. */
  savedAt: number;
}

/** The identity a draft belongs to. Drafts are keyed by identity because the
 *  composer can be opened as yourself or as any business/provider you manage,
 *  and a half-written business announcement must never resurface under your
 *  personal name (or vice versa). */
export interface DraftIdentity {
  type: "user" | "business" | "provider";
  id: string;
}

/** Minimal storage surface — `localStorage` satisfies it, and tests can pass a
 *  plain in-memory stand-in. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function draftKey(identity: DraftIdentity): string {
  return `${DRAFT_KEY_PREFIX}:${identity.type}:${identity.id || "self"}`;
}

export function emptyDraft(overrides: Partial<CommunityDraft> = {}): CommunityDraft {
  return {
    version: DRAFT_VERSION,
    type: null,
    title: "",
    body: "",
    media: [],
    imageAlt: "",
    pollOptions: ["", ""],
    pollDurationHours: DEFAULT_POLL_DURATION_HOURS,
    severity: null,
    lastSeen: "",
    reward: "",
    pickupNote: "",
    taggedListing: null,
    // Comments default to NEIGHBORS: the people the post is addressed to are
    // exactly the people who should be able to answer it. Authors who want a
    // broadcast can still pick OFF in Post settings.
    commentPolicy: "NEIGHBORS",
    hideLikeCount: false,
    savedAt: 0,
    ...overrides,
  };
}

/**
 * Whether a draft holds anything a user would be upset to lose. Selecting a
 * post type alone doesn't count — persisting that would make "Draft saved"
 * appear before the user has written a single word, which reads as noise and
 * trains people to ignore the indicator.
 */
export function isDraftMeaningful(d: CommunityDraft): boolean {
  return (
    d.title.trim().length > 0 ||
    d.body.trim().length > 0 ||
    d.media.length > 0 ||
    d.pollOptions.some((o) => o.trim().length > 0) ||
    d.lastSeen.trim().length > 0 ||
    d.reward.trim().length > 0 ||
    d.pickupNote.trim().length > 0 ||
    d.taggedListing != null
  );
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asStringArray(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, cap);
}

/**
 * Coerce whatever came out of storage into a valid draft. Deliberately
 * defensive: the payload may have been written by an older app version, or by
 * a newer one if the user downgraded via OTA rollback, and a composer that
 * throws on mount is far worse than one that starts empty.
 */
export function normalizeDraft(raw: unknown): CommunityDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== DRAFT_VERSION) return null;

  const pollOptions = asStringArray(r.pollOptions, 8);
  const duration = typeof r.pollDurationHours === "number" && r.pollDurationHours > 0
    ? r.pollDurationHours
    : DEFAULT_POLL_DURATION_HOURS;
  const severity = r.severity === "INFO" || r.severity === "WARNING" || r.severity === "URGENT"
    ? r.severity
    : null;
  const policy: CommentPolicy =
    r.commentPolicy === "EVERYONE" || r.commentPolicy === "NEIGHBORS" ||
    r.commentPolicy === "MUTUALS" || r.commentPolicy === "OFF"
      ? r.commentPolicy
      : "NEIGHBORS";

  let tagged: PostTag | null = null;
  const t = r.taggedListing as Record<string, unknown> | null | undefined;
  if (t && (t.listingType === "BUSINESS" || t.listingType === "PROVIDER") && typeof t.listingId === "string") {
    tagged = { listingType: t.listingType, listingId: t.listingId, name: asString(t.name) };
  }

  return emptyDraft({
    type: typeof r.type === "string" ? (r.type as CommunityPostType) : null,
    title: asString(r.title),
    body: asString(r.body),
    media: asStringArray(r.media, MAX_POST_MEDIA),
    imageAlt: asString(r.imageAlt),
    // Always keep at least the two starter option slots so the poll UI has
    // something to render after a restore.
    pollOptions: pollOptions.length >= MIN_POLL_OPTIONS ? pollOptions : ["", ""],
    pollDurationHours: duration,
    severity,
    lastSeen: asString(r.lastSeen),
    reward: asString(r.reward),
    pickupNote: asString(r.pickupNote),
    taggedListing: tagged,
    commentPolicy: policy,
    hideLikeCount: r.hideLikeCount === true,
    savedAt: typeof r.savedAt === "number" ? r.savedAt : 0,
  });
}

export function loadDraft(
  identity: DraftIdentity,
  storage: DraftStorage | null,
  now: number = Date.now()
): CommunityDraft | null {
  if (!storage) return null;
  let parsed: unknown;
  try {
    const raw = storage.getItem(draftKey(identity));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON, or storage access denied (private mode / disabled cookies).
    return null;
  }
  const draft = normalizeDraft(parsed);
  if (!draft) {
    clearDraft(identity, storage);
    return null;
  }
  if (draft.savedAt > 0 && now - draft.savedAt > DRAFT_TTL_MS) {
    clearDraft(identity, storage);
    return null;
  }
  if (!isDraftMeaningful(draft)) return null;
  return draft;
}

/**
 * Persist a draft, or remove it if there's nothing worth keeping. Returns
 * whether a draft is now stored, which is what drives the "Draft saved" hint —
 * the indicator then reflects reality even when storage silently rejects the
 * write (Safari private mode throws on setItem once the quota is hit).
 */
export function saveDraft(
  identity: DraftIdentity,
  draft: CommunityDraft,
  storage: DraftStorage | null,
  now: number = Date.now()
): boolean {
  if (!storage) return false;
  if (!isDraftMeaningful(draft)) {
    clearDraft(identity, storage);
    return false;
  }
  try {
    storage.setItem(draftKey(identity), JSON.stringify({ ...draft, version: DRAFT_VERSION, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(identity: DraftIdentity, storage: DraftStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(draftKey(identity));
  } catch {
    // Nothing actionable — a draft we can't remove will fall out via TTL.
  }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export interface DraftValidation {
  ok: boolean;
  /** One actionable sentence for the primary blocker, shown inline above the
   *  Post button. Null when the draft is postable. */
  message: string | null;
  /** Which field to point the user at, for focus/scroll and aria-describedby. */
  field: "type" | "title" | "pollOptions" | "severity" | null;
}

const OK: DraftValidation = { ok: true, message: null, field: null };

/**
 * The one place that decides whether a draft can be posted. The composer's
 * Post button, the preview step, and the unit tests all read this, so the
 * button can never disagree with the inline hint about why it's disabled.
 */
export function validateDraft(d: CommunityDraft): DraftValidation {
  if (!d.type) {
    return { ok: false, message: "Pick what kind of post this is", field: "type" };
  }
  const title = d.title.trim();
  if (title.length === 0) {
    return { ok: false, message: "Add a title so neighbors know what this is", field: "title" };
  }
  if (title.length < MIN_TITLE_LEN) {
    return { ok: false, message: `A few more characters — titles need at least ${MIN_TITLE_LEN}`, field: "title" };
  }
  if (d.type === "POLL") {
    const filled = d.pollOptions.filter((o) => o.trim().length > 0);
    if (filled.length < MIN_POLL_OPTIONS) {
      return { ok: false, message: `A poll needs at least ${MIN_POLL_OPTIONS} options`, field: "pollOptions" };
    }
    const seen = new Set(filled.map((o) => o.trim().toLowerCase()));
    if (seen.size !== filled.length) {
      return { ok: false, message: "Poll options must be different from each other", field: "pollOptions" };
    }
  }
  if (d.type === "ALERT" && !d.severity) {
    return { ok: false, message: "Choose how urgent this alert is", field: "severity" };
  }
  return OK;
}

/** Hours a post of this type stays in the feed, or null for evergreen posts.
 *  Time-boxing is what makes posting feel low-stakes (Snapchat's insight): an
 *  alert that ages out on its own is easier to post than one you must remember
 *  to clean up. */
export function expiryHoursFor(d: CommunityDraft, severityHours: (s: AlertSeverity) => number): number | null {
  if (d.type === "ALERT" && d.severity) return severityHours(d.severity);
  if (d.type === "POLL") return d.pollDurationHours;
  return null;
}
