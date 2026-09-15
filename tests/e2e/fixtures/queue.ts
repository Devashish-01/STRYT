import type { Page } from "@playwright/test";
import { expect } from "./staging";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

export const SALON = `/business/${BUSINESS.id}`;
export const QUEUE = `${SALON}/manage/queue`;

/** Leaves the queue if a previous run left this customer in it (the suite never depends on order). */
export async function leaveIfQueued(page: Page) {
  await page.goto("/queues");
  await expect(page.getByRole("button", { name: /^⏳ Active/ })).toBeVisible();
  await expect(page.locator(".skel")).toHaveCount(0);
  const leave = page.getByRole("button", { name: /^(Leave queue|Cancel visit)$/ });
  for (let n = await leave.count(); n > 0; n--) {
    await leave.first().click();
    await page.getByRole("button", { name: /^Yes, (leave queue|cancel)$/ }).click();
    await expect(page.getByText("Left the queue")).toBeVisible();
    await expect(leave).toHaveCount(n - 1);
  }
  // The card goes optimistically; confirm the server agrees.
  await expect
    .poll(async () => {
      await page.reload();
      await expect(page.getByRole("button", { name: /^⏳ Active/ })).toBeVisible();
      await expect(page.locator(".skel")).toHaveCount(0);
      return leave.count();
    }, { timeout: 45_000 })
    .toBe(0);
}

export async function joinQueue(page: Page) {
  await page.goto(SALON);
  await page.getByRole("button", { name: "Join queue" }).click();
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText(/You're #\d/)).toBeVisible();
}

/** Opens the owner's queue console with the queue switched on. */
export async function openQueueConsole(owner: Page) {
  await owner.goto(QUEUE);
  const toggle = owner.getByRole("button", { name: /^Queue is (ON|OFF)/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    await toggle.click();
    await expect(owner.getByText("Queue is now open")).toBeVisible();
  }
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
}
