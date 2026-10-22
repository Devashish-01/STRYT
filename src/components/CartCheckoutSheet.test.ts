import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Rendered on the server with the hooks stubbed — checks which choices a customer is shown after tapping the cart.
vi.mock("@/store", () => ({ useApp: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/services", () => ({ appointmentService: {} }));
vi.mock("@/components/PaymentMethodPanel", () => ({ PaymentMethodPanel: () => null }));

import CartCheckoutSheet from "./CartCheckoutSheet";

const render = (extra: { onDelivery?: () => void } = {}) =>
  renderToStaticMarkup(createElement(CartCheckoutSheet, {
    businessId: "b_1", businessName: "Sharma General Store", itemCount: 2, total: 115, summary: "Milk x1, Bread x1", items: [],
    onSchedule: () => {}, onPaid: () => {}, onClose: () => {}, ...extra,
  }));

describe("CartCheckoutSheet", () => {
  it("offers Buy in place and Book for another time when the shop doesn't deliver", () => {
    const html = render();
    expect(html).toContain("Buy in place");
    expect(html).toContain("Book for another time");
    expect(html).not.toContain("cart_home_delivery");
  });

  it("offers Home delivery as its own first-sheet choice when the shop delivers, and stops calling the later option a delivery option", () => {
    const html = render({ onDelivery: () => {} });
    expect(html).toContain("Buy in place");
    expect(html).toContain("cart_home_delivery");
    expect(html).toContain("cart_book_later_sub");
    expect(html).not.toContain("or have it delivered");
    // order: buy now, delivery, then later
    expect(html.indexOf("Buy in place")).toBeLessThan(html.indexOf("cart_home_delivery"));
    expect(html.indexOf("cart_home_delivery")).toBeLessThan(html.indexOf("Book for another time"));
  });
});
