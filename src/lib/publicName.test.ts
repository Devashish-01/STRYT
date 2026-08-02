import { describe, it, expect } from "vitest";
import {
  isPhoneName, isEmailName, isContactName, isUnusableName,
  firstName, displayName, greetingName, aliasName,
} from "./publicName";

/**
 * Feedback #6 — an email address was rendering as a display name.
 *
 * `handle_new_auth_user` seeded users.name from the signup contact detail, so
 * 8 of 10 live accounts had name === email. The phone half of that had always
 * been guarded here; the email half never was. Because a name renders to
 * STRANGERS (public profile, reviews, community, delivery cards), that was a
 * contact-details leak rather than a cosmetic problem — which is why these
 * assertions are about what must NEVER appear, not about formatting.
 */

const EMAILS = [
  "priya@gmail.com",
  "a.b+tag@sub.domain.co.in",
  "UPPER@Example.COM",
];
const PHONES = ["9876543210", "+91 98765 43210", "+91-98765-43210"];

describe("contact details never render as names", () => {
  it.each(EMAILS)("email %s is detected", (e) => {
    expect(isEmailName(e)).toBe(true);
    expect(isContactName(e)).toBe(true);
    expect(isUnusableName(e)).toBe(true);
  });

  it.each(PHONES)("phone %s is detected", (p) => {
    expect(isPhoneName(p)).toBe(true);
    expect(isContactName(p)).toBe(true);
  });

  it.each(EMAILS)("firstName(%s) never leaks the address", (e) => {
    const out = firstName(e);
    expect(out).toBe("Neighbor");
    expect(out).not.toContain("@");
  });

  it.each(EMAILS)("displayName(%s) never leaks the address", (e) => {
    const out = displayName(e);
    expect(out).toBe("STRYT Neighbor");
    expect(out).not.toContain("@");
  });

  it("aliasName never leaks an email even with no alias set", () => {
    const out = aliasName({ alias: null, name: "priya@gmail.com" });
    expect(out).not.toContain("@");
    expect(out).toBe("STRYT Neighbor");
  });

  it("an opted-in public name is still not allowed to be an email", () => {
    // showNamePublicly routes through displayName — the guard must hold there
    // too, or opting in would publish your address.
    const out = aliasName({ alias: "priya", name: "priya@gmail.com", showNamePublicly: true });
    expect(out).not.toContain("@");
  });
});

describe("real names are untouched", () => {
  it.each([
    ["Rohan Sharma", "Rohan"],
    ["Devashish", "Devashish"],
    ["  Meera  Nair ", "Meera"],
  ])("firstName(%s) -> %s", (input, expected) => {
    expect(firstName(input)).toBe(expected);
  });

  it("displayName keeps a real full name", () => {
    expect(displayName("Rohan Sharma")).toBe("Rohan Sharma");
  });

  it("an email-looking string that isn't one is still a name", () => {
    // No dot in the domain — not an address, so don't over-reach.
    expect(isEmailName("me@localhost")).toBe(false);
  });
});

describe("the 'New user' placeholder", () => {
  it("is unusable in BOTH helpers, not just displayName", () => {
    // The bug this guards: displayName special-cased it and firstName didn't,
    // so the backfill placeholder greeted people as "Hi, New".
    expect(isUnusableName("New user")).toBe(true);
    expect(firstName("New user")).toBe("Neighbor");
    expect(displayName("New user")).toBe("STRYT Neighbor");
  });
});

describe("greetingName falls back to the alias", () => {
  it("prefers a real first name", () => {
    expect(greetingName({ name: "Rohan Sharma", alias: "ro" })).toBe("Rohan");
  });

  it("uses the alias when the name is an email", () => {
    expect(greetingName({ name: "priya@gmail.com", alias: "priya_s" })).toBe("priya_s");
  });

  it("uses the alias when the name is the placeholder", () => {
    expect(greetingName({ name: "New user", alias: "priya_s" })).toBe("priya_s");
  });

  it("falls back to Neighbor when there is nothing usable", () => {
    expect(greetingName({ name: "New user", alias: null })).toBe("Neighbor");
    expect(greetingName(null)).toBe("Neighbor");
  });
});
