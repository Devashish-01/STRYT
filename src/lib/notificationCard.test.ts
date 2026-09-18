import { describe, it, expect } from "vitest";
import { distinctPill, initialsOf } from "./notificationCard";

describe("distinctPill", () => {
  it("drops a pill the title already says", () => {
    expect(distinctPill("Payment confirmed", "Confirmed")).toBeUndefined();
    expect(distinctPill("Appointment confirmed", "Confirmed ✓")).toBeUndefined();
    expect(distinctPill("Report reviewed: a post", "REVIEWED")).toBeUndefined();
  });

  it("keeps a pill that adds something", () => {
    expect(distinctPill("Payment received", "Awaiting confirmation")).toBe("Awaiting confirmation");
    expect(distinctPill("Counter-offer on your quote", "Awaiting Decision")).toBe("Awaiting Decision");
    expect(distinctPill("New quote for your request", "New Quote")).toBeUndefined();
  });

  it("shows nothing for an empty pill", () => {
    expect(distinctPill("Anything", undefined)).toBeUndefined();
    expect(distinctPill("Anything", null)).toBeUndefined();
    expect(distinctPill("Anything", " ✓ ")).toBeUndefined();
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Ravi Plumbing")).toBe("RP");
    expect(initialsOf("asha")).toBe("A");
    expect(initialsOf("  Test   Salon One ")).toBe("TS");
  });

  it("does not split a character in half", () => {
    expect(initialsOf("राहुल शर्मा")).toBe("रश");
    expect(initialsOf("🐶 Lovers")).toBe("🐶L");
  });

  it("is empty without a name", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf(undefined)).toBe("");
    expect(initialsOf("   ")).toBe("");
  });
});
