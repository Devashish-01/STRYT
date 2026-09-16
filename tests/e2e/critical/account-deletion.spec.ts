import type { Page } from "@playwright/test";
import { test, expect, expectAfterReload } from "../fixtures/staging";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

const B = `/business/${BUSINESS.id}`;

/** Restores owner1 if a previous run (or this one) left a deletion scheduled. Other specs need the salon visible. */
async function keepAccountIfPending(owner: Page) {
  await owner.goto("/auth/deletion-pending");
  // Pending → the screen stays with its Keep button; not pending → the app redirects away. Wait for either.
  const keep = owner.getByRole("button", { name: /Keep account & continue/ });
  await expect(keep.or(owner.getByRole("navigation").first())).toBeVisible({ timeout: 30_000 });
  if (await keep.isVisible()) {
    await keep.click();
    await expect(owner.getByText("Welcome back — account deletion cancelled.")).toBeVisible();
  }
}

// Owner schedules account deletion → lands on the deletion-pending screen → their storefront is hidden from others →
// owner keeps the account → the storefront is visible again.
test("account deletion: schedule, storefront hidden, cancel restores it", async ({ owner, guest }) => {
  await keepAccountIfPending(owner);
  await guest.goto(B);
  await expect(guest.getByRole("heading", { name: "Test Salon One" })).toBeVisible();

  try {
    await owner.goto("/settings/data");
    await owner.getByRole("button", { name: /^Delete account/ }).click();
    await expect(owner.getByRole("heading", { name: "Delete account?" })).toBeVisible();
    await expect(owner.getByText(/Your store and provider listings will be paused/)).toBeVisible();
    await owner.getByPlaceholder("Optional: why are you leaving? (helps us improve)").fill("E2E: testing the deletion flow");
    // DEL-6: Delete stays disabled until the confirmation is typed.
    await expect(owner.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    await owner.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("DELETE");
    await owner.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(owner).toHaveURL(/\/auth\/deletion-pending$/);
    await expect(owner.getByRole("button", { name: /Keep account & continue/ })).toBeVisible();

    // A signed-in app screen sends the owner back to the deletion-pending screen.
    await owner.goto("/home");
    await expect(owner).toHaveURL(/\/auth\/deletion-pending$/);

    // The salon is hidden from everyone else while deletion is pending.
    await expectAfterReload(guest, () => guest.getByRole("heading", { name: "Shop not found" }));
    await expect(guest.getByRole("heading", { name: "Test Salon One" })).toHaveCount(0);
  } finally {
    await keepAccountIfPending(owner);
  }

  // Restored: the owner is back in the app and the salon is public again.
  await owner.goto("/home");
  await expect(owner).not.toHaveURL(/deletion-pending/);
  await expectAfterReload(guest, () => guest.getByRole("heading", { name: "Test Salon One" }));
});
