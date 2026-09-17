import { describe, it, expect } from "vitest";
import { scrubString, scrubValue, scrubErrorReport } from "./scrubPii";

/**
 * These are written the way the leak would actually happen: a real error message from this codebase, a real
 * Supabase URL, a real breadcrumb. Each assertion checks the sensitive value is *absent*, not just that
 * something was replaced — a scrubber that returns "[redacted]" while leaving the original elsewhere in the
 * string would pass a weaker test.
 */

/** Fails if the needle survives anywhere in the output. */
function expectGone(output: string, needle: string) {
  expect(output).not.toContain(needle);
}

describe("phone numbers", () => {
  it.each([
    "9876543210",
    "+919876543210",
    "+91 98765 43210",
    "09876543210",
    "98765-43210",
    "+91-9876543210",
  ])("removes %s", (phone) => {
    const out = scrubString(`Booking failed for ${phone} at Sharma Salon`);
    expectGone(out, phone);
    expectGone(out, "9876543210");
  });

  it("removes an international number", () => {
    const out = scrubString("callback to +1 415 555 0123 failed");
    expectGone(out, "415 555 0123");
  });

  it("leaves an ordinary number alone", () => {
    // A price, a count, a slot capacity — redacting these would make reports useless.
    expect(scrubString("expected 3 slots, got 12")).toBe("expected 3 slots, got 12");
    expect(scrubString("packagePrice 1200")).toBe("packagePrice 1200");
  });
});

describe("emails", () => {
  it("removes an address from a message", () => {
    const out = scrubString("no user found for riya.sen+test@gmail.com");
    expectGone(out, "riya.sen+test@gmail.com");
    expect(out).toContain("[email]");
  });

  it("removes one embedded in a URL", () => {
    const out = scrubString("GET https://api.example.com/users?email=riya@gmail.com 404");
    expectGone(out, "riya@gmail.com");
  });
});

describe("government ids and payment handles", () => {
  it("removes an Aadhaar number however it is spaced", () => {
    for (const id of ["234512345678", "2345 1234 5678", "2345-1234-5678"]) {
      const out = scrubString(`verification failed for ${id}`);
      expectGone(out, id);
      expectGone(out, "5678");
    }
  });

  it("removes a PAN", () => {
    const out = scrubString("PAN ABCDE1234F rejected");
    expectGone(out, "ABCDE1234F");
  });

  it("removes a UPI handle", () => {
    const out = scrubString("payment to sharma.salon@oksbi did not settle");
    expectGone(out, "sharma.salon@oksbi");
  });
});

describe("coordinates", () => {
  it("removes a coordinate pair", () => {
    const out = scrubString("no businesses near 18.5204,73.8567");
    expectGone(out, "18.5204");
    expectGone(out, "73.8567");
  });

  it("removes lat/lng given as key-values", () => {
    const out = scrubString("reverse geocode failed lat=18.5204 lng=73.8567");
    expectGone(out, "18.5204");
    expectGone(out, "73.8567");
  });

  it("removes them from a query string", () => {
    const out = scrubString("https://nominatim.openstreetmap.org/reverse?lat=18.5204&lon=73.8567&format=json");
    expectGone(out, "18.5204");
    expectGone(out, "73.8567");
  });

  it("leaves a version number alone", () => {
    expect(scrubString("maplibre-gl 6.1.0 failed to load")).toContain("6.1.0");
  });
});

describe("secrets", () => {
  it("removes a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const out = scrubString(`auth failed with ${jwt}`);
    expectGone(out, jwt);
    expectGone(out, "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  });

  it("removes a bearer header", () => {
    const out = scrubString("Authorization: Bearer sb_secret_abc123XYZ789tokenvalue");
    expectGone(out, "sb_secret_abc123XYZ789tokenvalue");
  });

  it("removes an OTP", () => {
    expectGone(scrubString("otp 483921 expired"), "483921");
    expectGone(scrubString("handoff_code=7391"), "7391");
  });

  it("removes a token given as a query parameter", () => {
    const out = scrubString("https://stryt.in/track?tracking_token=abc123def456");
    expectGone(out, "abc123def456");
  });
});

describe("structured payloads", () => {
  it("drops a sensitive key's value whatever it holds", () => {
    const scrubbed = scrubValue({
      customer_name: "Riya Sen",
      phone: "9876543210",
      delivery_address_line: "12 MG Road, Pune",
      lat: 18.5204,
      lng: 73.8567,
      package_price: 1200,
      status: "PENDING",
    }) as Record<string, unknown>;

    expect(scrubbed.customer_name).toBe("[redacted]");
    expect(scrubbed.phone).toBe("[redacted]");
    expect(scrubbed.delivery_address_line).toBe("[redacted]");
    expect(scrubbed.lat).toBe("[redacted]");
    expect(scrubbed.lng).toBe("[redacted]");
    // The parts that make a report useful survive.
    expect(scrubbed.package_price).toBe(1200);
    expect(scrubbed.status).toBe("PENDING");
  });

  it("reaches into nested objects and arrays", () => {
    const scrubbed = scrubValue({
      appointments: [{ customer_name: "Riya", note: "call 9876543210" }],
    }) as { appointments: { customer_name: string; note: string }[] };

    expect(scrubbed.appointments[0].customer_name).toBe("[redacted]");
    expectGone(scrubbed.appointments[0].note, "9876543210");
  });

  it("survives a cycle instead of hanging", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    const scrubbed = scrubValue(a) as Record<string, unknown>;
    expect(scrubbed.self).toBe("[circular]");
  });

  it("never throws on odd input", () => {
    expect(() => scrubValue(undefined)).not.toThrow();
    expect(() => scrubValue(null)).not.toThrow();
    expect(() => scrubValue(Symbol("x") as unknown)).not.toThrow();
    expect(() => scrubString("" as string)).not.toThrow();
  });
});

describe("a whole error report", () => {
  it("scrubs message, stack, url, breadcrumbs and context together", () => {
    const report = scrubErrorReport({
      message: "Booking failed for Riya at riya@gmail.com / 9876543210",
      stack: "at book (https://stryt.in/app.js) near 18.5204,73.8567",
      url: "https://stryt.in/business/b1?phone=9876543210",
      breadcrumbs: [{ t: 1, msg: "tapped Book for +91 98765 43210" }],
      context: { customer_name: "Riya Sen", targetId: "b_real" },
    });

    const all = JSON.stringify(report);
    expectGone(all, "riya@gmail.com");
    expectGone(all, "9876543210");
    expectGone(all, "98765 43210");
    expectGone(all, "18.5204");
    expectGone(all, "Riya Sen");
    // What makes the report worth having is still there.
    expect(all).toContain("Booking failed");
    expect(all).toContain("b_real");
  });
});
