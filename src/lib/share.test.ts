import { describe, it, expect } from "vitest";
import { shareCapabilities, shareUrl, type ShareSubject } from "./share";

const ORIGIN = "https://stryt.app";

const shop = (over: Partial<Extract<ShareSubject, { kind: "business" }>> = {}): ShareSubject => ({
  kind: "business", id: "b1", title: "Anna's Store", subtitle: "Grocery", ...over,
});

describe("shareUrl", () => {
  it("derives the deep link from the subject, per kind", () => {
    expect(shareUrl(shop(), ORIGIN)).toBe(`${ORIGIN}/business/b1`);
    expect(shareUrl({ kind: "provider", id: "p1", title: "", subtitle: "" }, ORIGIN)).toBe(`${ORIGIN}/provider/p1`);
    expect(shareUrl({ kind: "post", id: "c1", title: "", subtitle: "" }, ORIGIN)).toBe(`${ORIGIN}/community/c1`);
    expect(shareUrl({ kind: "request", id: "r1", title: "", subtitle: "" }, ORIGIN)).toBe(`${ORIGIN}/request/r1`);
    expect(shareUrl({ kind: "person", id: "u1", title: "", subtitle: "" }, ORIGIN)).toBe(`${ORIGIN}/u/u1`);
  });

  it("points a campaign at the shop running it — campaigns have no standalone route", () => {
    const s: ShareSubject = { kind: "campaign", id: "d1", businessId: "b9", title: "", subtitle: "" };
    expect(shareUrl(s, ORIGIN)).toBe(`${ORIGIN}/business/b9`);
  });

  it("stays relative-safe with no origin and no window, never interpolating undefined", () => {
    const url = shareUrl(shop(), "");
    expect(url).toBe("/business/b1");
    expect(url).not.toContain("undefined");
  });
});

describe("shareCapabilities — the counter-stand gate", () => {
  // The reported bug: every subject got a "Print Stand" button wired to a
  // merchant poster, so a passing customer could print a shop's own signage.
  it("offers the counter stand only to someone who manages the shop", () => {
    expect(shareCapabilities(shop({ viewerManages: true }), ORIGIN).artifact).toBe("counter-stand");
    expect(shareCapabilities(shop({ viewerManages: false }), ORIGIN).artifact).toBeNull();
    expect(shareCapabilities(shop(), ORIGIN).artifact).toBeNull(); // absent = not managed
  });

  it("never offers a printable artifact for a post, request, person or campaign", () => {
    const subjects: ShareSubject[] = [
      { kind: "post", id: "c1", title: "", subtitle: "" },
      { kind: "post", id: "c2", title: "", subtitle: "", postType: "LOST_FOUND" },
      { kind: "request", id: "r1", title: "", subtitle: "" },
      { kind: "person", id: "u1", title: "", subtitle: "" },
      { kind: "campaign", id: "d1", businessId: "b1", title: "", subtitle: "", viewerManages: true },
    ];
    for (const s of subjects) expect(shareCapabilities(s, ORIGIN).artifact).toBeNull();
  });
});

describe("shareCapabilities — payment QR", () => {
  it("needs BOTH management and something to pay to", () => {
    expect(shareCapabilities(shop({ viewerManages: true, upiId: "shop@okaxis" }), ORIGIN).paymentQr).toBe(true);
    expect(shareCapabilities(shop({ viewerManages: true, paymentQrUrl: "http://x/qr.png" }), ORIGIN).paymentQr).toBe(true);
    // Managed but no UPI configured yet.
    expect(shareCapabilities(shop({ viewerManages: true }), ORIGIN).paymentQr).toBe(false);
    // A visitor must never surface the merchant's payment identity.
    expect(shareCapabilities(shop({ upiId: "shop@okaxis" }), ORIGIN).paymentQr).toBe(false);
  });

  it("is never offered for non-merchant subjects", () => {
    expect(shareCapabilities({ kind: "post", id: "c1", title: "", subtitle: "" }, ORIGIN).paymentQr).toBe(false);
    expect(shareCapabilities({ kind: "person", id: "u1", title: "", subtitle: "" }, ORIGIN).paymentQr).toBe(false);
  });
});

describe("shareCapabilities — QR meaning", () => {
  it("describes what scanning actually opens, per kind", () => {
    expect(shareCapabilities(shop(), ORIGIN).qr.scanLabel).toBe("SCAN TO OPEN THIS SHOP");
    expect(shareCapabilities({ kind: "post", id: "c1", title: "", subtitle: "" }, ORIGIN).qr.scanLabel)
      .toBe("SCAN TO SEE THIS POST");
    expect(shareCapabilities({ kind: "person", id: "u1", title: "", subtitle: "" }, ORIGIN).qr.scanLabel)
      .toBe("SCAN TO OPEN THIS PROFILE");
  });

  it("drops the QR entirely for a request — they expire within 24h", () => {
    const caps = shareCapabilities({ kind: "request", id: "r1", title: "", subtitle: "" }, ORIGIN);
    expect(caps.qr.enabled).toBe(false);
  });

  it("keeps the QR for everything else", () => {
    const kinds: ShareSubject[] = [
      shop(),
      { kind: "provider", id: "p1", title: "", subtitle: "" },
      { kind: "post", id: "c1", title: "", subtitle: "" },
      { kind: "person", id: "u1", title: "", subtitle: "" },
      { kind: "campaign", id: "d1", businessId: "b1", title: "", subtitle: "" },
    ];
    for (const s of kinds) expect(shareCapabilities(s, ORIGIN).qr.enabled).toBe(true);
  });
});
