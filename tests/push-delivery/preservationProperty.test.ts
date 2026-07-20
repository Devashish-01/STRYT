// Task 2 — Preservation property tests (BEFORE implementing the fix).
//
// Property 2: Preservation — Non-Buggy Delivery Behavior Unchanged.
//   FOR ALL X WHERE NOT isBugCondition(X) -> deliverPush(X) = deliverPush'(X)
//
// Methodology: observation-first. Each behavior below is first observed on
// the actual repo source (the probes in deliverPushModel.ts read the real
// files — none of which are touched by the fix: send-push's cleanup/coalesce
// branches, src/sw.js, src/lib/pushNotifications.ts, and the trigger
// migration). The property tests then encode those observations as
// invariants between the explicit UNFIXED (F) and FIXED (F') chains, so they
// PASS on the unfixed code/config and MUST keep passing after the fix
// (re-run verbatim in Task 3.7).
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  deliverPushWith,
  UNFIXED,
  FIXED,
  isBugCondition,
  triggerFiresAfterInsert,
  insertIsNonBlocking,
  webStaleCleanupEnabled,
  fcmStaleCleanupEnabled,
  nativeNavEvent,
  webNavMessageType,
  webCoalescesByType,
  fcmPreservesDataType,
  coalescingMeta,
  processCredentials,
  type NotificationDelivery,
  type Platform,
  type AppState,
  type FixState,
  type WebSub,
  type FcmTok,
} from "./deliverPushModel";

const platform = (): fc.Arbitrary<Platform> =>
  fc.constantFrom<Platform>("android", "web");
const appState = (): fc.Arbitrary<AppState> =>
  fc.constantFrom<AppState>("open", "background", "closed");

const delivery = (): fc.Arbitrary<NotificationDelivery> =>
  fc.record({
    platform: platform(),
    hasValidToken: fc.boolean(),
    appState: appState(),
    backendConfigured: fc.boolean(),
  });

// The genuinely observable outcome of a delivery attempt — what a user or an
// on-call engineer could actually notice. `channelExistsOnDevice` is
// deliberately excluded: it is the diagnostic flag that literally *is* the
// fix's target artifact, so it is expected to flip from false to true across
// F -> F'. For every input where NOT isBugCondition(X), that flip has no
// observable consequence (there is no token to deliver to / no subscriber),
// which is exactly what this omission encodes.
function observableOutcome(x: NotificationDelivery, fix: FixState) {
  const r = deliverPushWith(x, fix);
  return {
    sendPushInvoked: r.sendPushInvoked,
    webSubscriptionRowExists: r.webSubscriptionRowExists,
    webSent: r.webSent,
    fcmSent: r.fcmSent,
    osBannerDisplayed: r.osBannerDisplayed,
  };
}

describe("Property 2: Preservation — non-buggy delivery behavior unchanged", () => {
  // ---------------------------------------------------------------------
  // req 3.1 — in-app row creation, regardless of push outcome.
  // ---------------------------------------------------------------------
  describe("req 3.1: in-app notification row is always written", () => {
    it("observed on repo: the push trigger fires AFTER INSERT, so the row already exists before any push logic runs", () => {
      // An AFTER INSERT trigger cannot suppress or roll back the row it fires
      // on — by the time push_on_notification_insert runs, the row is already
      // part of the transaction's write set. This is fix-independent: neither
      // Change 1-3 touches the trigger's timing or the notifications insert.
      expect(triggerFiresAfterInsert()).toBe(true);
    });

    it("FOR ALL X, the row-write guarantee (AFTER INSERT) does not depend on isBugCondition(X) or fix state", () => {
      fc.assert(
        fc.property(delivery(), () => {
          // The row write is modeled as a repo-structural fact, not a
          // per-input branch — so it is trivially the same for every X, in
          // both UNFIXED and FIXED. Asserted here to document the invariant.
          expect(triggerFiresAfterInsert()).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  // ---------------------------------------------------------------------
  // req 3.2 — non-blocking, fire-and-forget insert semantics.
  // ---------------------------------------------------------------------
  describe("req 3.2: a failing/erroring send-push never rolls back or errors the insert", () => {
    it("observed on repo: trigger uses pg_net (async) and swallows all errors via WHEN OTHERS -> RETURN NEW", () => {
      expect(insertIsNonBlocking()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // req 3.3 — stale-credential cleanup.
  // ---------------------------------------------------------------------
  describe("req 3.3: stale-credential cleanup (web 404/410, FCM UNREGISTERED/INVALID_ARGUMENT)", () => {
    it("observed on repo: send-push deletes push_subscriptions on 404/410", () => {
      expect(webStaleCleanupEnabled()).toBe(true);
    });

    it("observed on repo: send-push deletes fcm_tokens on UNREGISTERED/INVALID_ARGUMENT", () => {
      expect(fcmStaleCleanupEnabled()).toBe(true);
    });

    const webSubArb = (): fc.Arbitrary<WebSub> =>
      fc.record({
        endpoint: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `https://push.example/${s}`),
        status: fc.constantFrom<"ok" | "gone404" | "gone410" | "otherError">(
          "ok",
          "gone404",
          "gone410",
          "otherError",
        ),
      });
    const fcmTokArb = (): fc.Arbitrary<FcmTok> =>
      fc.record({
        token: fc.string({ minLength: 1, maxLength: 20 }),
        status: fc.constantFrom<"ok" | "unregistered" | "invalidArgument" | "otherError">(
          "ok",
          "unregistered",
          "invalidArgument",
          "otherError",
        ),
      });

    it("FOR ALL mixed valid/stale credential sets, stale entries are deleted and valid ones delivered — identically under UNFIXED and FIXED", () => {
      fc.assert(
        fc.property(
          fc.array(webSubArb(), { maxLength: 8 }),
          fc.array(fcmTokArb(), { maxLength: 8 }),
          (subs, toks) => {
            const before = processCredentials(subs, toks, UNFIXED);
            const after = processCredentials(subs, toks, FIXED);

            expect(after).toEqual(before);

            // Cross-check the cleanup contract itself: every "ok" credential
            // is delivered and never deleted; every stale one is deleted and
            // never delivered; every "otherError" one is left alone.
            for (const s of subs) {
              if (s.status === "ok") {
                expect(before.deliveredEndpoints).toContain(s.endpoint);
                expect(before.deletedEndpoints).not.toContain(s.endpoint);
              } else if (s.status === "gone404" || s.status === "gone410") {
                expect(before.deletedEndpoints).toContain(s.endpoint);
                expect(before.deliveredEndpoints).not.toContain(s.endpoint);
              } else {
                expect(before.deliveredEndpoints).not.toContain(s.endpoint);
                expect(before.deletedEndpoints).not.toContain(s.endpoint);
              }
            }
            for (const t of toks) {
              if (t.status === "ok") {
                expect(before.deliveredTokens).toContain(t.token);
                expect(before.deletedTokens).not.toContain(t.token);
              } else if (t.status === "unregistered" || t.status === "invalidArgument") {
                expect(before.deletedTokens).toContain(t.token);
                expect(before.deliveredTokens).not.toContain(t.token);
              } else {
                expect(before.deliveredTokens).not.toContain(t.token);
                expect(before.deletedTokens).not.toContain(t.token);
              }
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // ---------------------------------------------------------------------
  // req 3.4 — deep-link tap routing.
  // ---------------------------------------------------------------------
  describe("req 3.4: deep-link tap routing (native push-nav, web SW NAVIGATE)", () => {
    it("observed on repo: native dispatches the push-nav CustomEvent", () => {
      expect(nativeNavEvent()).toBe("push-nav");
    });

    it("observed on repo: web SW posts { type: NAVIGATE, path } to the client", () => {
      expect(webNavMessageType()).toBe("NAVIGATE");
    });
  });

  // ---------------------------------------------------------------------
  // req 3.5 — type-based coalescing.
  // ---------------------------------------------------------------------
  describe("req 3.5: type-based coalescing (web tag, FCM data.type)", () => {
    it("observed on repo: web SW groups notifications by tag: data.type", () => {
      expect(webCoalescesByType()).toBe(true);
    });

    it("observed on repo: FCM payload preserves data.type", () => {
      expect(fcmPreservesDataType()).toBe(true);
    });

    it("FOR ALL bursts of same-type notifications, web tag and FCM data.type coalescing metadata is stable", () => {
      fc.assert(
        fc.property(
          fc.option(fc.constantFrom("APPOINTMENT", "QUEUE_UPDATE", "SYSTEM", "COMMUNITY"), { nil: undefined }),
          fc.integer({ min: 1, max: 20 }), // burst size
          (type, burstSize) => {
            const metas = Array.from({ length: burstSize }, () => coalescingMeta(type));
            // Every notification in the burst coalesces to the same key.
            const firstKey = metas[0].webTag;
            for (const m of metas) {
              expect(m.webTag).toBe(firstKey);
              expect(m.fcmDataType).toBe(firstKey);
              expect(m.webTag).toBe(m.fcmDataType);
            }
            // Absent/empty type falls back to "SYSTEM" (send-push's `type || "SYSTEM"`).
            if (!type) {
              expect(firstKey).toBe("SYSTEM");
            } else {
              expect(firstKey).toBe(type);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // ---------------------------------------------------------------------
  // req 3.6 — per-platform independence.
  // ---------------------------------------------------------------------
  describe("req 3.6: a one-platform-only user delivers on that path independent of the other path's config", () => {
    it("FOR ALL android inputs, the result never depends on webVapidConfigured", () => {
      fc.assert(
        fc.property(
          fc.record({
            hasValidToken: fc.boolean(),
            appState: appState(),
            backendConfigured: fc.boolean(),
          }),
          fc.boolean(),
          fc.boolean(),
          (partial, webA, webB) => {
            const x: NotificationDelivery = { platform: "android", ...partial };
            const r1 = deliverPushWith(x, { androidChannelExists: true, webVapidConfigured: webA });
            const r2 = deliverPushWith(x, { androidChannelExists: true, webVapidConfigured: webB });
            expect(r1).toEqual(r2);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("FOR ALL web inputs, the result never depends on androidChannelExists", () => {
      fc.assert(
        fc.property(
          fc.record({
            hasValidToken: fc.boolean(),
            appState: appState(),
            backendConfigured: fc.boolean(),
          }),
          fc.boolean(),
          fc.boolean(),
          (partial, androidA, androidB) => {
            const x: NotificationDelivery = { platform: "web", ...partial };
            const r1 = deliverPushWith(x, { androidChannelExists: androidA, webVapidConfigured: true });
            const r2 = deliverPushWith(x, { androidChannelExists: androidB, webVapidConfigured: true });
            expect(r1).toEqual(r2);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // ---------------------------------------------------------------------
  // The core Property 2 assertion: FOR ALL X WHERE NOT isBugCondition(X),
  // deliverPush(X) = deliverPush'(X) on the observable outcome.
  // ---------------------------------------------------------------------
  describe("core property: deliverPush(X) = deliverPush'(X) for all non-buggy X", () => {
    it("FOR ALL X WHERE NOT isBugCondition(X) -> UNFIXED and FIXED chains produce the same observable outcome", () => {
      fc.assert(
        fc.property(
          delivery().filter((x) => !isBugCondition(x)),
          (x) => {
            const before = observableOutcome(x, UNFIXED);
            const after = observableOutcome(x, FIXED);
            expect(after).toEqual(before);
          },
        ),
        { numRuns: 500 },
      );
    });

    // Concrete regression anchors — one per platform, mirroring the counter-
    // examples in bugfix.md so a future change that narrows the fix's scope
    // is caught even if the generator happens not to hit these exact cases.
    it("Android, backend configured, NO valid token (not a bug condition): no banner either way", () => {
      const x: NotificationDelivery = {
        platform: "android",
        hasValidToken: false,
        appState: "closed",
        backendConfigured: true,
      };
      expect(observableOutcome(x, UNFIXED)).toEqual(observableOutcome(x, FIXED));
      expect(deliverPushWith(x, FIXED).osBannerDisplayed).toBe(false);
    });

    it("Android, backend NOT configured (not a bug condition): trigger no-ops either way", () => {
      const x: NotificationDelivery = {
        platform: "android",
        hasValidToken: true,
        appState: "closed",
        backendConfigured: false,
      };
      expect(observableOutcome(x, UNFIXED)).toEqual(observableOutcome(x, FIXED));
      expect(deliverPushWith(x, FIXED).sendPushInvoked).toBe(false);
    });

    it("Web, backend NOT configured (not a bug condition): no subscription, no push either way", () => {
      const x: NotificationDelivery = {
        platform: "web",
        hasValidToken: false,
        appState: "open",
        backendConfigured: false,
      };
      expect(observableOutcome(x, UNFIXED)).toEqual(observableOutcome(x, FIXED));
      expect(deliverPushWith(x, FIXED).webSent).toBe(0);
    });
  });
});
