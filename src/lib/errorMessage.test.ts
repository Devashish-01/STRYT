import { describe, it, expect } from "vitest";
import { errorMessage, errorCode } from "./errorMessage";

describe("errorMessage", () => {
  it("uses an Error's message", () => {
    expect(errorMessage(new Error("Slot already taken"))).toBe("Slot already taken");
  });

  it("uses a message on a plain object, which is what Supabase throws", () => {
    expect(errorMessage({ message: "duplicate key value violates unique constraint" })).toContain("duplicate key");
  });

  it("uses a thrown string", () => {
    expect(errorMessage("SLOT_FULL")).toBe("SLOT_FULL");
  });

  it("falls back for null, undefined and objects with no message", () => {
    expect(errorMessage(null, "Couldn't book")).toBe("Couldn't book");
    expect(errorMessage(undefined, "Couldn't book")).toBe("Couldn't book");
    expect(errorMessage({ status: 500 }, "Couldn't book")).toBe("Couldn't book");
  });

  it("falls back for an empty or whitespace-only message", () => {
    // "" in a toast renders an empty bar, which reads as a glitch rather than an error.
    expect(errorMessage(new Error(""), "Couldn't book")).toBe("Couldn't book");
    expect(errorMessage({ message: "   " }, "Couldn't book")).toBe("Couldn't book");
    expect(errorMessage("", "Couldn't book")).toBe("Couldn't book");
  });

  it("has a default fallback so a caller cannot produce an empty toast by omission", () => {
    expect(errorMessage(null)).toMatch(/something went wrong/i);
  });

  it("does not throw on hostile input", () => {
    const hostile = {
      get message(): never {
        throw new Error("nope");
      },
    };
    // Reading .message invokes the getter, so the implementation has to guard it — this function runs
    // inside catch blocks, and an error handler that throws is worse than the error it was handling.
    expect(() => errorMessage(hostile, "safe")).not.toThrow();
  });
});

describe("errorCode", () => {
  it("reads a Postgres SQLSTATE", () => {
    expect(errorCode({ code: "23505" })).toBe("23505");
  });

  it("stringifies a numeric code", () => {
    expect(errorCode({ code: 409 })).toBe("409");
  });

  it("returns undefined when there is none", () => {
    expect(errorCode(new Error("boom"))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode("SLOT_FULL")).toBeUndefined();
  });
});
