import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ConsoleStatusStrip from "./ConsoleStatusStrip";
import { bookingStatus } from "@/lib/consoleStatus";

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const controls = { onAvailability: vi.fn(), onBookings: vi.fn() };

describe("Business booking and availability controls", () => {
  it("distinguishes paused bookings while availability stays on", () => {
    const html = renderToStaticMarkup(createElement(ConsoleStatusStrip, {
      available: true, availabilityKey: "bhome_open_now", booking: bookingStatus(true, false), ...controls,
    }));
    expect(html).toContain('role="switch" aria-checked="true" aria-label="console_availability"');
    expect(html).toContain('role="switch" aria-checked="false" aria-label="bset_accepting"');
    expect(html).toContain("console_bookings_paused");
  });

  it("shows Bookings off without a bookings switch even if acceptance was previously on", () => {
    const html = renderToStaticMarkup(createElement(ConsoleStatusStrip, {
      available: true, availabilityKey: "bhome_open_now", booking: bookingStatus(false, true), ...controls,
    }));
    expect(html).toContain("console_bookings_off");
    expect(html.match(/role="switch"/g)).toHaveLength(1);
    expect(html).not.toContain("bset_accepting");
  });

  it("renders the Dashboard and staff summary without controls", () => {
    const html = renderToStaticMarkup(createElement(ConsoleStatusStrip, {
      available: false, availabilityKey: "bhome_closed_now", booking: bookingStatus(true, true),
    }));
    expect(html).toContain("bhome_closed_now");
    expect(html).toContain("console_bookings_accepting");
    expect(html).not.toContain('role="switch"');
  });
});
