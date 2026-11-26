import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "@/lib/i18n/en";
import { formatFullOrderDateTime, formatOrderDateTime } from "@/lib/format";
import type { AppointmentRecord } from "@/types";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    lang: "en",
    t: (key: string, fallback?: string) => en[key] ?? fallback ?? key,
    tf: (key: string, params: Record<string, string | number>) => {
      let s = en[key] ?? key;
      for (const [k, v] of Object.entries(params)) {
        s = s.split(`{${k}}`).join(String(v));
      }
      return s;
    },
    setLang: vi.fn(),
  }),
}));

vi.mock("@/store", () => ({ useApp: () => ({ dataSaver: false }) }));

import { CompactOrderCard } from "./CompactOrderCard";

const tEn = (key: string) => en[key] ?? key;

function makeOrder(overrides: Partial<AppointmentRecord> = {}): AppointmentRecord {
  const now = new Date();
  now.setHours(13, 42, 0, 0);
  const iso = now.toISOString();
  return {
    id: "apt-1",
    targetId: "biz-1",
    targetName: "Sharma General Store",
    targetType: "BUSINESS",
    customerId: "cust-1",
    customerName: "Asha",
    scheduledForISO: iso,
    dateLabel: "Today",
    timeLabel: "ASAP",
    status: "COMPLETED",
    createdAtISO: iso,
    fulfillmentType: "DELIVERY",
    deliveryAddressLine: "Amanora Park Town",
    packagePrice: 470,
    paymentStatus: "PAID",
    paymentMethod: "CASH",
    paymentAmount: 470,
    items: [
      { catalogItemId: "i1", name: "Whole Wheat Atta 5 kg", price: 265, quantity: 1 },
      { catalogItemId: "i2", name: "Sunflower Oil 1 L", price: 135, quantity: 1 },
      { catalogItemId: "i3", name: "Toned Milk 1 L", price: 70, quantity: 1 },
    ],
    ...overrides,
  };
}

describe("order date-time formatting", () => {
  it("includes Today + local time for same-day orders", () => {
    const d = new Date();
    d.setHours(13, 42, 0, 0);
    const label = formatOrderDateTime(d.toISOString(), "en", tEn);
    expect(label).toContain("Today, ");
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });

  it("includes Yesterday + local time for previous-day orders", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(18, 10, 0, 0);
    const label = formatOrderDateTime(d.toISOString(), "en", tEn);
    expect(label).toContain("Yesterday, ");
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });

  it("falls back cleanly when ISO is invalid", () => {
    expect(
      formatOrderDateTime("not-a-date", "en", tEn, { dateLabel: "Today", timeLabel: "ASAP" })
    ).toBe("Today");
    expect(
      formatFullOrderDateTime(undefined, "en", { dateLabel: "24 Nov", timeLabel: "6:10 PM" })
    ).toBe("24 Nov, 6:10 PM");
  });
});

describe("CompactOrderCard unified receipt & timestamp", () => {
  it("shows recorded order time in the collapsed subtitle", () => {
    const html = renderToStaticMarkup(createElement(CompactOrderCard, { apt: makeOrder() }));
    expect(html).toContain("Sharma General Store");
    expect(html).toMatch(/Today, \d{1,2}:\d{2}/);
    expect(html).toContain("3 items (Whole Wheat Atta 5 kg, Sunflower Oil 1 L…)");
  });

  it("renders paid payment inline inside the receipt without a nested card", () => {
    const html = renderToStaticMarkup(
      createElement(CompactOrderCard, {
        apt: makeOrder(),
        defaultExpanded: true,
        onRebook: vi.fn(),
        onReview: vi.fn(),
      })
    );
    // Only the single outer `.card` wrapper should exist — no nested `.card` for payment.
    const cardMatches = html.match(/class="card\b/g) ?? [];
    expect(cardMatches).toHaveLength(1);
    expect(html).toContain("Ordered ");
    expect(html).toContain("Paid via CASH");
    expect(html).toContain("Confirmed");
    expect(html).toContain("View Shop");
    expect(html).toContain("Order again");
    expect(html).toContain("Rate &amp; Review");
  });

  it("shows inline Pay action inside the receipt when an order is unpaid", () => {
    const html = renderToStaticMarkup(
      createElement(CompactOrderCard, {
        apt: makeOrder({ paymentStatus: "UNPAID", paymentMethod: null, paymentAmount: null }),
        defaultExpanded: true,
        onPay: vi.fn(),
      })
    );
    expect(html).toContain("Payment due");
    expect(html).toContain("Pay now");
    expect(html).toContain("₹470");
  });

  it("supports Mine tab mode with item title, inline paid hint, always-visible Order again + View in My Deals", () => {
    const html = renderToStaticMarkup(
      createElement(CompactOrderCard, {
        apt: makeOrder(),
        titleMode: "items",
        hideViewShop: true,
        alwaysShowActions: true,
        onRebook: vi.fn(),
        onViewInDeals: vi.fn(),
      })
    );
    expect(html).toContain("3 items (Whole Wheat Atta 5 kg, Sunflower Oil 1 L…)");
    expect(html).toContain("✓ Paid via CASH");
    expect(html).toContain("Order again");
    expect(html).toContain("View in My Deals");
    expect(html).not.toContain("View Shop");
  });

  it("shows Track in My Deals when an order is still active", () => {
    const html = renderToStaticMarkup(
      createElement(CompactOrderCard, {
        apt: makeOrder({ status: "ACCEPTED" }),
        titleMode: "items",
        hideViewShop: true,
        alwaysShowActions: true,
        onRebook: vi.fn(),
        onViewInDeals: vi.fn(),
      })
    );
    expect(html).toContain("Track in My Deals");
  });
});
