import type { CommentPolicy } from "@/types";

/**
 * Comment-policy presentation and the client-side mirror of the server's gate.
 *
 * The authority is `can_comment_on_post()` in the database (see
 * supabase/migrations/20260892_community_comment_policy.sql). Everything here is
 * for the interface: which composer to show, and what to say when the composer
 * isn't available. The two must agree on the *shape* of the rule, which is why
 * the decision lives in one tested function rather than being re-derived inline
 * in the post screen.
 */

export interface CommentPolicyMeta {
  value: CommentPolicy;
  /** Picker label. */
  label: string;
  /** One line explaining the consequence, in the author's terms. */
  hint: string;
  emoji: string;
}

/** Ordered most-open to most-closed: the picker reads as a dial, and the
 *  default sits where most posts want to be rather than at an extreme. */
export const COMMENT_POLICIES: readonly CommentPolicyMeta[] = [
  { value: "EVERYONE", label: "Everyone", hint: "Anyone on STRYT can reply", emoji: "🌍" },
  { value: "NEIGHBORS", label: "Neighbors", hint: "People nearby can reply", emoji: "🏘️" },
  { value: "MUTUALS", label: "Friends", hint: "Only people you follow back", emoji: "🤝" },
  { value: "OFF", label: "No replies", hint: "Nobody can comment", emoji: "🔒" },
] as const;

export const COMMENT_POLICY_META: Record<CommentPolicy, CommentPolicyMeta> =
  COMMENT_POLICIES.reduce((acc, m) => {
    acc[m.value] = m;
    return acc;
  }, {} as Record<CommentPolicy, CommentPolicyMeta>);

export const DEFAULT_COMMENT_POLICY: CommentPolicy = "NEIGHBORS";

/** Mirrors COMMENT_RATE_LIMIT / COMMENT_RATE_WINDOW in 20260892. Duplicated
 *  rather than fetched so the UI can warn before a send fails; if the server
 *  value changes, this only affects the warning, never the enforcement. */
export const COMMENT_RATE_LIMIT = 10;
export const COMMENT_RATE_WINDOW_MS = 60_000;

/**
 * Resolve a post's effective policy from whichever columns the row actually
 * has. Rows written before 20260892 only carry the `allow_comments` boolean,
 * where `true` meant "on, but mutual follows only" — that's MUTUALS, not
 * EVERYONE. Reading it as EVERYONE would retroactively open threads their
 * authors never agreed to open.
 */
export function resolveCommentPolicy(post: {
  commentPolicy?: CommentPolicy | null;
  allowComments?: boolean | null;
}): CommentPolicy {
  if (post.commentPolicy) return post.commentPolicy;
  if (post.allowComments === true) return "MUTUALS";
  if (post.allowComments === false) return "OFF";
  return DEFAULT_COMMENT_POLICY;
}

/** Reason codes returned by the `comment_gate_reason` RPC. */
export type CommentGateReason =
  | "OK"
  | "OFF"
  | "TOO_FAR"
  | "NOT_MUTUAL"
  | "BLOCKED"
  | "RATE_LIMITED"
  | "SIGN_IN"
  | "NOT_FOUND";

export interface GateCopy {
  /** Shown where the composer would be. */
  message: string;
  /** True when the situation is the viewer's to change (follow back, move
   *  closer is not actionable — but following is), which decides whether we
   *  offer an action alongside the message. */
  actionable: boolean;
}

/**
 * What to say when someone can't comment. Each reason gets its own sentence:
 * a single "you can't comment" covers four very different situations, and the
 * one the viewer can fix (not following each other) is indistinguishable from
 * the ones they can't.
 *
 * Deliberately says nothing that reveals the other party's actions — "BLOCKED"
 * reads as unavailable, not as "you have been blocked".
 */
export function gateCopy(reason: CommentGateReason): GateCopy {
  switch (reason) {
    case "OFF":
      return { message: "Comments are turned off for this post.", actionable: false };
    case "TOO_FAR":
      return { message: "Only neighbors nearby can reply to this post.", actionable: false };
    case "NOT_MUTUAL":
      return { message: "Follow each other to comment.", actionable: true };
    case "BLOCKED":
      return { message: "You can't reply to this post.", actionable: false };
    case "RATE_LIMITED":
      return { message: "You're commenting quickly — take a short break and try again.", actionable: false };
    case "SIGN_IN":
      return { message: "Sign in to join the conversation.", actionable: true };
    case "NOT_FOUND":
      return { message: "This post is no longer available.", actionable: false };
    case "OK":
    default:
      return { message: "", actionable: false };
  }
}

export interface LocalGateInput {
  policy: CommentPolicy;
  isAuthor: boolean;
  /** Both directions of `follows` confirmed. */
  isMutual: boolean;
  /** Viewer is inside the post's commenting range. Undefined = unknown (the
   *  post has no coordinates, or the viewer has no location on file). */
  withinRange?: boolean;
  blocked?: boolean;
  /** Comments this viewer has posted inside the rate window. */
  recentComments?: number;
}

/**
 * Predict the server's answer, for deciding what to render before anyone types.
 * Kept structurally identical to can_comment_on_post()'s branch order — author,
 * then block, then rate limit, then policy — so the UI and the database can't
 * disagree about precedence (e.g. showing a composer on a post where a block
 * would reject the send).
 */
export function localGate(input: LocalGateInput): { ok: boolean; reason: CommentGateReason } {
  if (input.isAuthor) return { ok: true, reason: "OK" };
  if (input.blocked) return { ok: false, reason: "BLOCKED" };
  if ((input.recentComments ?? 0) >= COMMENT_RATE_LIMIT) return { ok: false, reason: "RATE_LIMITED" };

  switch (input.policy) {
    case "OFF":
      return { ok: false, reason: "OFF" };
    case "EVERYONE":
      return { ok: true, reason: "OK" };
    case "NEIGHBORS":
      // An unmeasurable distance falls back to the mutual-follow test rather
      // than failing open — same as the server.
      if (input.withinRange === true) return { ok: true, reason: "OK" };
      if (input.withinRange === false) return { ok: false, reason: "TOO_FAR" };
      return input.isMutual ? { ok: true, reason: "OK" } : { ok: false, reason: "NOT_MUTUAL" };
    case "MUTUALS":
    default:
      return input.isMutual ? { ok: true, reason: "OK" } : { ok: false, reason: "NOT_MUTUAL" };
  }
}

/** Short label for the post header, so readers know the rules before they type. */
export function policyBadge(policy: CommentPolicy): string | null {
  if (policy === "OFF") return "🔒 Replies off";
  if (policy === "MUTUALS") return "🤝 Friends only";
  if (policy === "EVERYONE") return "🌍 Open to all";
  return null; // NEIGHBORS is the default; labelling it would be noise
}
