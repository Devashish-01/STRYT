import { describe, it, expect, vi, beforeEach } from "vitest";
import { scrubEvent, initSentry, sentryActive, reportToSentry } from "./sentry";

/**
 * The two properties that matter before a DSN exists:
 *   - with no DSN, nothing happens at all — no import, no init, no network;
 *   - anything that would be sent has been through the scrubber first.
 *
 * Both are testable without a Sentry account, which is the point: the parts that could leak data or slow the
 * app are proven now, and the owner's step is only to create the project.
 */

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("without a DSN", () => {
  it("does not start", async () => {
    await initSentry();
    expect(sentryActive()).toBe(false);
  });

  it("forwarding an error is a no-op rather than an error", () => {
    expect(() => reportToSentry(new Error("boom"), { kind: "MANUAL" })).not.toThrow();
  });
});

describe("scrubEvent", () => {
  it("scrubs the message", () => {
    const out = scrubEvent({ message: "Booking failed for riya@gmail.com / 9876543210" });
    const all = JSON.stringify(out);
    expect(all).not.toContain("riya@gmail.com");
    expect(all).not.toContain("9876543210");
    expect(all).toContain("Booking failed");
  });

  it("scrubs breadcrumbs, exception values and extra", () => {
    const out = scrubEvent({
      message: "failed",
      breadcrumbs: [{ message: "tapped Book for +91 98765 43210" }],
      exception: { values: [{ value: "no user at 18.5204,73.8567" }] },
      extra: { customer_name: "Riya Sen", targetId: "b_real" },
    });
    const all = JSON.stringify(out);
    expect(all).not.toContain("98765 43210");
    expect(all).not.toContain("18.5204");
    expect(all).not.toContain("Riya Sen");
    expect(all).toContain("b_real");
  });

  it("reduces a user object to its opaque id", () => {
    const out = scrubEvent({
      message: "x",
      user: { id: "u_123", email: "riya@gmail.com", username: "Riya Sen", ip_address: "49.36.1.2" },
    }) as { user?: Record<string, unknown> };
    expect(out?.user).toEqual({ id: "u_123" });
    expect(JSON.stringify(out)).not.toContain("riya@gmail.com");
  });

  it("drops the user object entirely when there is no id to keep", () => {
    const out = scrubEvent({ message: "x", user: { email: "riya@gmail.com" } }) as { user?: unknown };
    expect(out?.user).toBeUndefined();
  });

  it("scrubs a request url", () => {
    const out = scrubEvent({
      message: "request failed",
      request: { url: "https://stryt.in/business/b1?phone=9876543210", method: "GET" },
    });
    expect(JSON.stringify(out)).not.toContain("9876543210");
  });

  it("drops the event rather than sending it raw if scrubbing throws", () => {
    const hostile = {
      message: "x",
      get extra(): never {
        throw new Error("nope");
      },
    };
    expect(scrubEvent(hostile as unknown as Record<string, unknown>)).toBeNull();
  });
});
