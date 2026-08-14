import { describe, it, expect } from "vitest";
import {
  COMMENT_POLICIES,
  COMMENT_RATE_LIMIT,
  DEFAULT_COMMENT_POLICY,
  gateCopy,
  localGate,
  policyBadge,
  resolveCommentPolicy,
  type CommentGateReason,
  type LocalGateInput,
} from "./commentPolicy";
import type { CommentPolicy } from "@/types";

/**
 * These tests guard two promises that matter more than the mechanics:
 *
 * 1. Opening comments must not retroactively open OLD posts. Before 20260892,
 *    `allow_comments = true` meant "on, mutual follows only". Reading that as
 *    EVERYONE would widen threads whose authors never agreed to it.
 * 2. The client's prediction must not disagree with the server about
 *    precedence. If the UI shows a composer where the database would reject the
 *    insert, the user types a comment and loses it.
 */

function gate(over: Partial<LocalGateInput> = {}): LocalGateInput {
  return { policy: "NEIGHBORS", isAuthor: false, isMutual: false, ...over };
}

describe("legacy rows keep the openness their author chose", () => {
  it("allow_comments = true resolves to MUTUALS, never EVERYONE", () => {
    expect(resolveCommentPolicy({ allowComments: true })).toBe("MUTUALS");
  });

  it("allow_comments = false resolves to OFF", () => {
    expect(resolveCommentPolicy({ allowComments: false })).toBe("OFF");
  });

  it("an explicit policy always wins over the legacy boolean", () => {
    // The sync trigger keeps allow_comments truthful, so a disagreement means
    // the newer column is the one that was actually chosen.
    expect(resolveCommentPolicy({ commentPolicy: "EVERYONE", allowComments: false })).toBe("EVERYONE");
    expect(resolveCommentPolicy({ commentPolicy: "OFF", allowComments: true })).toBe("OFF");
  });

  it("a row with neither column falls back to the product default", () => {
    expect(resolveCommentPolicy({})).toBe(DEFAULT_COMMENT_POLICY);
    expect(resolveCommentPolicy({ commentPolicy: null, allowComments: null })).toBe(DEFAULT_COMMENT_POLICY);
  });
});

describe("the author is never locked out of their own post", () => {
  it.each(COMMENT_POLICIES.map((p) => p.value))("policy %s still lets the author comment", (policy) => {
    expect(localGate(gate({ policy, isAuthor: true })).ok).toBe(true);
  });

  it("even a blocked relationship doesn't stop the author on their own post", () => {
    // Matches the server: the author branch returns before the block check.
    expect(localGate(gate({ isAuthor: true, blocked: true })).ok).toBe(true);
  });
});

describe("precedence matches the server's branch order", () => {
  it("a block beats an EVERYONE policy", () => {
    const r = localGate(gate({ policy: "EVERYONE", blocked: true }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("BLOCKED");
  });

  it("the rate limit beats an EVERYONE policy", () => {
    const r = localGate(gate({ policy: "EVERYONE", recentComments: COMMENT_RATE_LIMIT }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("RATE_LIMITED");
  });

  it("a block is reported ahead of the rate limit", () => {
    expect(localGate(gate({ blocked: true, recentComments: 99 })).reason).toBe("BLOCKED");
  });

  it("just under the rate limit still passes", () => {
    expect(localGate(gate({ policy: "EVERYONE", recentComments: COMMENT_RATE_LIMIT - 1 })).ok).toBe(true);
  });
});

describe("each policy admits exactly who it says", () => {
  it("OFF admits nobody but the author", () => {
    expect(localGate(gate({ policy: "OFF", isMutual: true, withinRange: true })).reason).toBe("OFF");
  });

  it("EVERYONE admits a stranger who is far away", () => {
    expect(localGate(gate({ policy: "EVERYONE", isMutual: false, withinRange: false })).ok).toBe(true);
  });

  it("MUTUALS ignores distance entirely", () => {
    expect(localGate(gate({ policy: "MUTUALS", isMutual: true, withinRange: false })).ok).toBe(true);
    expect(localGate(gate({ policy: "MUTUALS", isMutual: false, withinRange: true })).reason).toBe("NOT_MUTUAL");
  });

  it("NEIGHBORS admits someone in range regardless of following", () => {
    // This is the whole point of the change: the neighbors a post is addressed
    // to can now answer it.
    expect(localGate(gate({ policy: "NEIGHBORS", isMutual: false, withinRange: true })).ok).toBe(true);
  });

  it("NEIGHBORS rejects someone measurably out of range", () => {
    expect(localGate(gate({ policy: "NEIGHBORS", withinRange: false })).reason).toBe("TOO_FAR");
  });

  it("NEIGHBORS with an unmeasurable distance falls back to mutuals, not open", () => {
    // A post with no coordinates, or a viewer with no location on file. Failing
    // open here would silently make every location-less post public.
    expect(localGate(gate({ policy: "NEIGHBORS", withinRange: undefined, isMutual: false })).reason).toBe("NOT_MUTUAL");
    expect(localGate(gate({ policy: "NEIGHBORS", withinRange: undefined, isMutual: true })).ok).toBe(true);
  });
});

describe("what the viewer is told", () => {
  const REASONS: CommentGateReason[] = ["OFF", "TOO_FAR", "NOT_MUTUAL", "BLOCKED", "RATE_LIMITED", "SIGN_IN", "NOT_FOUND"];

  it("every blocked reason gets its own non-empty sentence", () => {
    const seen = new Set<string>();
    for (const r of REASONS) {
      const copy = gateCopy(r);
      expect(copy.message.length).toBeGreaterThan(0);
      expect(seen.has(copy.message)).toBe(false); // no two reasons share wording
      seen.add(copy.message);
    }
  });

  it("only the fixable situations are marked actionable", () => {
    expect(gateCopy("NOT_MUTUAL").actionable).toBe(true);
    expect(gateCopy("SIGN_IN").actionable).toBe(true);
    expect(gateCopy("TOO_FAR").actionable).toBe(false);
    expect(gateCopy("OFF").actionable).toBe(false);
  });

  it("a block never tells the viewer they were blocked", () => {
    // Confirming a block invites a second account; it stays a dead end instead.
    const msg = gateCopy("BLOCKED").message.toLowerCase();
    expect(msg).not.toContain("block");
  });

  it("OK says nothing", () => {
    expect(gateCopy("OK").message).toBe("");
  });
});

describe("the header badge", () => {
  it("labels the non-default policies and stays quiet on the default", () => {
    expect(policyBadge("NEIGHBORS")).toBeNull();
    for (const p of ["OFF", "MUTUALS", "EVERYONE"] as CommentPolicy[]) {
      expect(policyBadge(p)).toBeTruthy();
    }
  });
});
