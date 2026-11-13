import { describe, expect, it } from "vitest";
import { accountGate, isAuthCallbackUrl } from "./accountGate";

const V = "2026-11-12";
const ready = { deletionScheduledAt: null, termsAcceptedVersion: V, onboardingCompletedAt: "2026-11-01T00:00:00Z" };

describe("accountGate", () => {
  it("is READY when nothing is outstanding", () => {
    expect(accountGate(ready, V)).toBe("READY");
  });

  it("checks deletion first, then terms, then onboarding", () => {
    expect(accountGate({ deletionScheduledAt: "2026-12-01", termsAcceptedVersion: "old", onboardingCompletedAt: null }, V)).toBe("DELETION_PENDING");
    expect(accountGate({ ...ready, termsAcceptedVersion: "old", onboardingCompletedAt: null }, V)).toBe("TERMS");
    expect(accountGate({ ...ready, onboardingCompletedAt: null }, V)).toBe("ONBOARD");
  });

  it("re-prompts for terms when the legal version moves on", () => {
    expect(accountGate(ready, "2027-01-01")).toBe("TERMS");
    expect(accountGate({ ...ready, termsAcceptedVersion: null }, V)).toBe("TERMS");
  });

  it("treats a missing (undefined) onboarding field as finished, as the layouts always have", () => {
    expect(accountGate({ ...ready, onboardingCompletedAt: undefined }, V)).toBe("READY");
  });
});

describe("isAuthCallbackUrl", () => {
  it("spots an OAuth / magic-link landing", () => {
    expect(isAuthCallbackUrl({ hash: "#access_token=x", search: "" })).toBe(true);
    expect(isAuthCallbackUrl({ hash: "#error=denied", search: "" })).toBe(true);
    expect(isAuthCallbackUrl({ hash: "", search: "?code=abc" })).toBe(true);
    expect(isAuthCallbackUrl({ hash: "", search: "?tab=requests" })).toBe(false);
  });
});
