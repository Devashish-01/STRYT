import { describe, it, expect } from "vitest";

describe("ciNegative", () => {
  it("deliberately fails to prove CI gate rejects failing tests", () => {
    expect(1).toBe(2);
  });
});
