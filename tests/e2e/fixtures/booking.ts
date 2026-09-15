import type { Page } from "@playwright/test";
import { expect } from "./staging";

/**
 * Opens a business or provider page and books `item` through the real booking sheet.
 * `dayOffset` 2–6 picks a date in the sheet's strip (0 = Today, 1 = Tomorrow); specs use different
 * day/time pairs so they never compete for the same slot capacity.
 */
export async function bookSlot(page: Page, opts: { target: string; item: string; dayOffset: number; time: string; note: string }) {
  await page.goto(opts.target);
  await page.getByRole("button", { name: "Book Appointment", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^${escapeRe(opts.item)} ₹`) }).click();
  await pickDay(page, opts.dayOffset);
  await page.getByRole("button", { name: new RegExp(`^${escapeRe(opts.time)}\\b`) }).click();
  await page.getByPlaceholder(/Describe your requirement/).fill(opts.note);
  await page.getByRole("button", { name: new RegExp(`^Confirm Booking · ${escapeRe(opts.time)}`) }).click();
}

export async function pickDay(page: Page, dayOffset: number) {
  if (dayOffset < 2) {
    await page.getByRole("button", { name: dayOffset === 0 ? "Today" : "Tomorrow", exact: true }).click();
    return;
  }
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const label = `${d.getDate()} ${d.toLocaleDateString("en-US", { weekday: "short" })}`;
  await page.getByRole("button", { name: label, exact: true }).click();
}

/** "Mon, Sep 21" as the app writes date labels. */
export function dateLabel(dayOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** The owner console's card for one booking, found by the customer's unique note. */
export const bookingCard = (page: Page, note: string) => page.locator("div.card.queue-row-enter").filter({ hasText: note });

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
