import { describe, expect, it } from "vitest";
import { parseTestPhones, skipAppVerificationFor } from "./otpDevTest";

describe("the development-only test-number switch", () => {
  it("is never on in a production build, even for a listed number", () => {
    expect(skipAppVerificationFor("+919999999999", { dev: false, testPhones: "+919999999999" })).toBe(false);
  });

  it("is on in development for a listed test number only", () => {
    const opts = { dev: true, testPhones: "+919999999999, +919999900001" };
    expect(skipAppVerificationFor("+919999999999", opts)).toBe(true);
    expect(skipAppVerificationFor("+919999900001", opts)).toBe(true);
    expect(skipAppVerificationFor("+917974388188", opts)).toBe(false); // a real person's number never matches
  });

  it("is off when nothing is configured", () => {
    for (const testPhones of [undefined, null, "", "   "]) {
      expect(skipAppVerificationFor("+919999999999", { dev: true, testPhones })).toBe(false);
    }
  });

  it("ignores anything that isn't a plain international number", () => {
    expect(parseTestPhones("+919999999999,not-a-number,,9999999999, +91 99999 99999")).toEqual(["+919999999999"]);
  });
});
