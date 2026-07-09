// Task 1 — Bug condition exploration tests (BEFORE the fix).
//
// Property 1: Bug Condition — Displayable Push Produces an OS Banner.
//   FOR ALL X WHERE isBugCondition(X) -> deliverPush'(X).osBannerDisplayed = true
//
// CRITICAL: These checks MUST FAIL on the unfixed code/config. The failure
// (and the fast-check counterexample) is what proves the bug exists. They are
// the SAME checks re-run in Task 3.6 to confirm the fix (Fix Checking).
//
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  deliverPush,
  isBugCondition,
  liveBackendConfigured,
  type NotificationDelivery,
  type Platform,
  type AppState,
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

describe("Property 1: Bug Condition — displayable push produces an OS banner", () => {
  // Scoped PBT: model deliverPush over the full input domain but scope the
  // property to the concrete failing cases via isBugCondition so the
  // counterexamples are reproducible.
  it("FOR ALL X WHERE isBugCondition(X) -> osBannerDisplayed = true", () => {
    fc.assert(
      fc.property(
        delivery().filter(isBugCondition),
        (x) => {
          const result = deliverPush(x);
          expect(result.osBannerDisplayed).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  // Concrete case 1 — Android missing-channel (Req 1.1, 1.2).
  it("Android missing-channel: valid token + backend configured + app closed shows a banner", () => {
    const x: NotificationDelivery = {
      platform: "android",
      hasValidToken: true,
      appState: "closed",
      backendConfigured: true,
    };
    const result = deliverPush(x);
    // send-push targets "stryt_default" but that channel is never created on
    // device, so Android 8+ drops the notification.
    expect(result.channelExistsOnDevice).toBe(true);
    expect(result.osBannerDisplayed).toBe(true);
  });

  // Concrete case 2 — Web missing-subscription (Req 1.3).
  it("Web missing-subscription: registerPush creates a push_subscriptions row", () => {
    const x: NotificationDelivery = {
      platform: "web",
      hasValidToken: false,
      appState: "open",
      backendConfigured: true,
    };
    const result = deliverPush(x);
    // VITE_VAPID_PUBLIC_KEY is empty, so registerPush returns early and no row
    // is ever created.
    expect(result.webSubscriptionRowExists).toBe(true);
  });

  // Concrete case 3 — Web no-delivery (Req 1.4).
  it("Web no-delivery: send-push reports webSent > 0 for a web user", () => {
    const x: NotificationDelivery = {
      platform: "web",
      hasValidToken: false,
      appState: "open",
      backendConfigured: true,
    };
    const result = deliverPush(x);
    // With no subscription row, send-push has nothing to deliver to (subs.length === 0).
    expect(result.webSent).toBeGreaterThan(0);
  });

  // Concrete case 4 — Backend prerequisite edge case (Req 1.5, 1.6).
  it("Backend prerequisite: with GUCs/secrets verified, send-push is invoked", () => {
    const x: NotificationDelivery = {
      platform: "android",
      hasValidToken: true,
      appState: "closed",
      // Sourced from the live operational probe (design tasks 3.4/3.5); unset
      // until GUCs + edge secrets are verified, so the trigger no-ops silently.
      backendConfigured: liveBackendConfigured(),
    };
    const result = deliverPush(x);
    expect(result.sendPushInvoked).toBe(true);
  });
});
