import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FEATURES, featurePath, featureStatus, rankFeatures, visibleFeatures, type FeatureContext } from "./businessFeatures";
import { buildDialItems, type DialContext } from "./businessDial";
import { BUSINESS_PACKAGES, PACKAGE_KEYS } from "./businessPackages";

const ctx = (over: Partial<FeatureContext> = {}): FeatureContext => ({
  bookingsOn: false, deliveryOn: false, queueUsed: false, catalogCount: 0, galleryCount: 0, hoursSet: false, verified: false, deliveryFlag: true, isOwner: true, ...over,
});
const ids = (list: { id: string }[]) => list.map((f) => f.id);

describe("the catalogue", () => {
  it("has a unique id, title and pitch for every idea, and every one is in the English strings", () => {
    const en = readFileSync("src/lib/i18n/en.ts", "utf8");
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    for (const f of FEATURES) {
      expect(en, f.titleKey).toContain(`${f.titleKey}:`);
      expect(en, f.pitchKey).toContain(`${f.pitchKey}:`);
    }
  });

  it("only suggests packages that exist", () => {
    for (const f of FEATURES) if (f.bestFor !== "all") for (const k of f.bestFor) expect(PACKAGE_KEYS, `${f.id}: ${k}`).toContain(k);
  });

  it("assumes no country, currency or payment scheme — it has to read the same anywhere", () => {
    const en = readFileSync("src/lib/i18n/en.ts", "utf8");
    const text = FEATURES.flatMap((f) => [f.titleKey, f.pitchKey]).map((k) => en.match(new RegExp(`${k}: "([^"]*)"`))?.[1] ?? "").join(" ");
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(/₹|\bINR\b|\bUPI\b|\bRupee|\$|€|£|\bGST\b/i);
  });
});

describe("status", () => {
  const byId = (id: string) => FEATURES.find((f) => f.id === id)!;
  it("reads the real state of the business", () => {
    expect(featureStatus(byId("bookings"), ctx({ bookingsOn: true }))).toBe("on");
    expect(featureStatus(byId("bookings"), ctx())).toBe("off");
    expect(featureStatus(byId("catalog"), ctx({ catalogCount: 3 }))).toBe("on");
    expect(featureStatus(byId("catalog"), ctx())).toBe("todo");
    expect(featureStatus(byId("queue"), ctx({ queueUsed: true }))).toBe("on");
    expect(featureStatus(byId("verify"), ctx({ verified: true }))).toBe("on");
    expect(featureStatus(byId("payments"), ctx())).toBe("tool");
  });
});

describe("what is offered", () => {
  it("hides delivery while the feature flag is off, so a build that hasn't shipped it never advertises it", () => {
    expect(ids(visibleFeatures(ctx({ deliveryFlag: false })))).not.toContain("delivery");
    expect(ids(visibleFeatures(ctx({ deliveryFlag: true })))).toContain("delivery");
  });

  it("leaves owner-only ideas out for anyone else", () => {
    const team = ids(visibleFeatures(ctx({ isOwner: false })));
    for (const owner of ["payments", "verify", "team", "reach", "bookings", "updates"]) expect(team).not.toContain(owner);
    expect(team).toContain("catalog");
  });
});

describe("ranking", () => {
  const rank = (pkg: Parameters<typeof rankFeatures>[0], c = ctx()) =>
    rankFeatures(pkg, (BUSINESS_PACKAGES[pkg].console?.actions ?? []).map((a) => a.id), c);

  it("puts what suits this kind of business first, and the rest under 'more'", () => {
    const clinic = rank("clinic");
    expect(ids(clinic.recommended)).toContain("bookings");
    expect(ids(clinic.recommended)).toContain("queue");
    expect(ids(clinic.recommended)).not.toContain("delivery"); // a clinic doesn't deliver
    expect(ids(clinic.more)).toContain("delivery");
  });

  it("recommends delivery to a shop but not bookings", () => {
    const shop = rank("shop");
    expect(ids(shop.recommended)).toContain("delivery");
    expect(ids(shop.more)).toContain("bookings");
  });

  it("follows the package's own order of importance", () => {
    const clinic = ids(rank("clinic").recommended);
    expect(clinic.indexOf("bookings")).toBeLessThan(clinic.indexOf("verify"));
  });

  it("moves what is already working out of the suggestions", () => {
    const r = rank("clinic", ctx({ bookingsOn: true, catalogCount: 4 }));
    expect(ids(r.active)).toEqual(expect.arrayContaining(["bookings", "catalog"]));
    expect(ids(r.recommended)).not.toContain("bookings");
  });

  it("every feature lands in exactly one group, for every kind of business", () => {
    for (const pkg of PACKAGE_KEYS) {
      const r = rank(pkg);
      const all = [...r.recommended, ...r.more, ...r.active];
      expect(ids(all).sort(), pkg).toEqual(ids(visibleFeatures(ctx())).sort());
    }
  });

  it("treats a business with no specific type as suited to everything", () => {
    expect(rank("generic").more).toEqual([]);
  });
});

describe("paths", () => {
  it("hangs console screens off the console root and leaves account screens alone", () => {
    expect(featurePath("/business/b1/manage", "/hours")).toBe("/business/b1/manage/hours");
    expect(featurePath("/business/b1/manage", "/account/business-access")).toBe("/account/business-access");
  });
});

describe("the dial", () => {
  const dial = (over: Partial<DialContext> = {}): DialContext => ({
    businessId: "b1", base: "/business/b1/manage", isOwner: true, hasScope: () => true, bookingsOn: true, queueUsed: true, queueWaiting: 2,
    deliveryOn: false, hasActiveDeliveries: false, storeLabel: "Menu", consoleOrder: [], ...over,
  });
  const order = (c: DialContext) => buildDialItems(c).map((i) => i.id);

  it("puts the package's most important tools first and 'Add features' always last", () => {
    const o = order(dial({ consoleOrder: ["catalog", "bookings"] }));
    expect(o.slice(0, 2)).toEqual(["store", "appointments"]);
    expect(o[o.length - 1]).toBe("features");
  });

  it("uses the package's own words where it has them", () => {
    const items = buildDialItems(dial({ consoleLabels: { bookings: "Consultations", queue: "Waiting room" } }));
    expect(items.find((i) => i.id === "appointments")?.label).toBe("Consultations");
    expect(items.find((i) => i.id === "queue")?.label).toBe("Waiting room");
    expect(items.find((i) => i.id === "payments")?.labelKey).toBe("bdial_payments");
  });

  it("never offers a business what it doesn't do", () => {
    const o = order(dial({ bookingsOn: false, queueUsed: false, deliveryOn: false }));
    expect(o).not.toContain("appointments");
    expect(o).not.toContain("queue");
    expect(o).not.toContain("deliveries");
  });

  it("gives a team member only what their grant covers, and no way to add features", () => {
    const scoped = order(dial({ isOwner: false, hasScope: (s) => s === "queue" }));
    expect(scoped).toContain("queue");
    for (const no of ["appointments", "store", "messages", "payments", "reviews", "features", "hours"]) expect(scoped).not.toContain(no);
    expect(scoped).toContain("business"); // the hub self-filters, as it always did
  });

  it("carries the queue's waiting count as a badge, and keeps messages inside this business", () => {
    const items = buildDialItems(dial());
    expect(items.find((i) => i.id === "queue")?.badge).toBe(2);
    expect(items.find((i) => i.id === "messages")?.to).toBe("/chats?scope=BUSINESS&id=b1");
  });

  it("lists nothing twice", () => {
    const o = order(dial({ consoleOrder: ["bookings", "bookings", "queue", "delivery", "catalog", "inbox", "payments", "hours"], deliveryOn: true, hasActiveDeliveries: true }));
    expect(new Set(o).size).toBe(o.length);
  });
});
