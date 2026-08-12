import { describe, it, expect } from "vitest";
import { suggestAliases } from "./aliasSuggest";
import { isValidAlias } from "./publicName";

/**
 * The handle step is the one thing in onboarding we cannot derive and cannot
 * skip (the alias/real-name privacy model depends on every user owning one).
 * So the whole design rests on the suggestions being good enough to tap —
 * which means the awkward inputs matter more than the happy path:
 * Devanagari names that normalise to nothing, two-letter names below the
 * length floor, and the seed placeholders that leak in from auth.
 */

describe("suggestAliases — ordinary names", () => {
  it("derives first.last, firstlast and an initialled form, best first", () => {
    expect(suggestAliases("Rahul Sharma")).toEqual(["rahul.sharma", "rahulsharma", "rahul.s"]);
  });

  it("uses the LAST word as the surname for three-part names", () => {
    // "Kumar" is a middle name here — the surname is what people expect.
    expect(suggestAliases("Anil Kumar Verma")).toEqual(["anil.verma", "anilverma", "anil.v"]);
  });

  it("lowercases and strips punctuation the handle charset forbids", () => {
    expect(suggestAliases("O'Brien D'Souza")).toEqual(["obrien.dsouza", "obriendsouza", "obrien.d"]);
  });

  it("pads a single-word name numerically rather than returning one option", () => {
    expect(suggestAliases("Rahul")).toEqual(["rahul", "rahul1", "rahul2"]);
  });
});

describe("suggestAliases — the email fallback", () => {
  it("falls back to the email local part when the name is unusable", () => {
    // "New user" is the seed placeholder userService.me() writes.
    const out = suggestAliases("New user", "priya.nair@gmail.com");
    expect(out[0]).toBe("priya.nair");
  });

  it("drops a +tag from the local part", () => {
    expect(suggestAliases(null, "rahul+shopping@gmail.com")[0]).toBe("rahul");
  });

  it("rescues a Devanagari name, which normalises to nothing on its own", () => {
    // The app ships in Hindi and Marathi; for these users the email is the
    // only Latin-script identity we hold. Without this they'd get no
    // suggestions at all and be forced to invent a handle by typing.
    expect(suggestAliases("राहुल शर्मा")).toEqual([]);
    expect(suggestAliases("राहुल शर्मा", "rahul.s@gmail.com")[0]).toBe("rahul.s");
  });

  it("appends the email suggestion after the name-derived ones", () => {
    const out = suggestAliases("Rahul Sharma", "rs2024@gmail.com");
    expect(out[0]).toBe("rahul.sharma");
    expect(out).not.toContain("rs2024"); // limit reached by name-derived forms first
  });
});

describe("suggestAliases — length and charset guarantees", () => {
  it("never returns anything isValidAlias rejects", () => {
    const inputs: [string | null, string | null][] = [
      ["Rahul Sharma", "r@x.com"],
      ["Al Bo", null],
      ["A B", null],
      ["Jo", null],
      ["राहुल", "x@y.com"],
      ["New user", "a@b.com"],
      [null, null],
      ["", ""],
      ["Bartholomew Fitzwilliam-Montgomery", null],
      ["9876543210", null],
      ["user@example.com", null],
    ];
    for (const [name, email] of inputs) {
      for (const candidate of suggestAliases(name, email)) {
        expect(isValidAlias(candidate), `"${candidate}" from (${name}, ${email})`).toBe(true);
      }
    }
  });

  it("meets the 3-character floor for names too short to reach it", () => {
    // "Jo" alone is 2 chars and illegal; padding is what makes it offerable.
    const out = suggestAliases("Jo");
    expect(out).toEqual(["jo1", "jo2", "jo3"]);
  });

  it("respects the 20-character ceiling, keeping the digits when padding", () => {
    const out = suggestAliases("Bartholomew Fitzwilliammontgomery");
    for (const candidate of out) expect(candidate.length).toBeLessThanOrEqual(20);
    expect(new Set(out).size).toBe(out.length);
  });

  it("leaves no trailing separator after truncation", () => {
    for (const candidate of suggestAliases("Bartholomewfitzwilli Ammontgomery")) {
      expect(candidate).not.toMatch(/[._]$/);
    }
  });
});

describe("suggestAliases — contract", () => {
  it("never exceeds the requested limit, and honours a custom one", () => {
    expect(suggestAliases("Rahul Sharma").length).toBeLessThanOrEqual(3);
    expect(suggestAliases("Rahul Sharma", null, 2)).toEqual(["rahul.sharma", "rahulsharma"]);
    expect(suggestAliases("Rahul Sharma", null, 1)).toEqual(["rahul.sharma"]);
  });

  it("returns no duplicates", () => {
    const out = suggestAliases("Sam Sam", "samsam@x.com");
    expect(new Set(out).size).toBe(out.length);
  });

  it("returns an empty array when there is genuinely nothing to derive", () => {
    // The screen must handle this by showing the custom input alone.
    expect(suggestAliases(null, null)).toEqual([]);
    expect(suggestAliases("New user", null)).toEqual([]);
    expect(suggestAliases("राहुल", null)).toEqual([]);
  });

  it("never derives a handle from a raw phone number or email used as a name", () => {
    // isUnusableName guards both; a handle seeded from a phone number would
    // publish it, since the alias is the one field strangers always see.
    expect(suggestAliases("9876543210", null)).toEqual([]);
    expect(suggestAliases("priya@gmail.com", null)).toEqual([]);
  });
});
