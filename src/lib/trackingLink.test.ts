import { describe, expect, it } from "vitest";
import { trackingUrl } from "./trackingLink";

describe("trackingUrl", () => {
  it("builds the link from the public host", () => {
    expect(trackingUrl("abc-123", "https://stryt.in")).toBe("https://stryt.in/track/abc-123");
  });
  it("tolerates a trailing slash on the host", () => {
    expect(trackingUrl("t", "https://stryt.in/")).toBe("https://stryt.in/track/t");
  });
  it("never produces the WebView's own origin", () => {
    expect(trackingUrl("t")).not.toContain("localhost");
  });
  it("encodes anything unusual in the token", () => {
    expect(trackingUrl("a b/c", "https://stryt.in")).toBe("https://stryt.in/track/a%20b%2Fc");
  });
});
