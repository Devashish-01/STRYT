import type { Page } from "@playwright/test";
import { test, expect, uid, expectAfterReload } from "../fixtures/staging";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

const B = `/business/${BUSINESS.id}`;

async function writeReview(customer: Page, stars: number, comment: string) {
  await customer.goto(B);
  await customer.getByRole("button", { name: "Reviews", exact: true }).click();
  await customer.getByRole("button", { name: /Write a review/i }).click();
  // The sheet is titled "Edit your review" once this customer has reviewed this shop before, and opens on what they
  // wrote — so the "can't submit with no stars" rule only applies to a fresh review (CRAT-8).
  const sheet = customer.locator(".sheet").filter({ hasText: /Write a review|Edit your review/ });
  await expect(sheet).toBeVisible();
  if (await sheet.getByText("Write a review").count()) {
    await expect(sheet.getByRole("button", { name: "Submit review" })).toBeDisabled();
  }
  await sheet.getByRole("button", { name: `${stars} star${stars > 1 ? "s" : ""}`, exact: true }).click();
  await expect(sheet.getByRole("button", { name: `${stars} star${stars > 1 ? "s" : ""}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByPlaceholder("Share your experience (optional)").fill(comment);
  await sheet.getByRole("button", { name: "Submit review" }).click();
  await expect(customer.getByText("Review submitted! Thank you.")).toBeVisible();
}

const reviewsTab = (page: Page, text: string) => async () => {
  await page.getByRole("button", { name: "Reviews", exact: true }).click();
  return page.getByText(text);
};

// Customer rates the shop with a comment → the review shows on the shop page and in the owner's reviews console.
test("ratings & reviews: a customer review appears on the shop and in the owner console", async ({ customer, owner }) => {
  const comment = `Great haircut ${uid()}`;
  await writeReview(customer, 4, comment);
  await expectAfterReload(customer, reviewsTab(customer, comment));

  await owner.goto(`${B}/manage/reviews`);
  const card = owner.locator("div.card").filter({ hasText: comment }).last();
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Reply" })).toBeVisible();
});

// Owner replies from the console → the customer sees the reply under their review.
test("ratings & reviews: owner replies and the customer sees the reply", async ({ customer, owner }) => {
  const comment = `Lovely service ${uid()}`;
  const reply = `Thanks for visiting ${uid()}`;
  await writeReview(customer, 5, comment);

  await owner.goto(`${B}/manage/reviews`);
  const card = owner.locator("div.card").filter({ hasText: comment }).last();
  await card.getByRole("button", { name: "Reply" }).click();
  await card.getByPlaceholder("Reply publicly…").fill(reply);
  await card.getByRole("button", { name: "Post reply" }).click();
  await expect(card.getByText("Your reply")).toBeVisible();
  await expect(card.getByText(reply)).toBeVisible();

  await customer.goto(B);
  await expectAfterReload(customer, reviewsTab(customer, reply));
  await customer.goto("/notifications");
  await expect(customer.getByText(/replied to your review/).first()).toBeVisible();
});
