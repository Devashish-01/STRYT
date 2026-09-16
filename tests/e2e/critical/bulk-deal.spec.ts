import type { Page } from "@playwright/test";
import { test, expect, uid, expectAfterReload } from "../fixtures/staging";
import { SHOP } from "../../../scripts/staging/personas.mjs";

const MANAGER = `/business/${SHOP.id}/manage/bulk-deals`;

async function pledge(page: Page, title: string, units: number) {
  await page.goto("/community-hub");
  await page.getByRole("button", { name: "📦 Bulk buying" }).click();
  const card = page.getByRole("button", { name: new RegExp(title) }).filter({ has: page.getByRole("button", { name: "Join deal" }) });
  await expectAfterReload(page, async () => {
    await page.getByRole("button", { name: "📦 Bulk buying" }).click();
    return card;
  });
  await card.getByRole("button", { name: "Join deal" }).click();
  for (let i = 1; i < units; i++) await page.getByRole("button", { name: "Increase" }).click();
  await page.getByRole("button", { name: new RegExp(`^Pledge ${units} units?$`) }).click();
  await expect(page.getByText("Pay your deposit")).toBeVisible();
  await page.getByRole("button", { name: "I've paid in cash" }).click();
  await expect(page.getByText("Deposit sent — waiting for the business to confirm.")).toBeVisible();
}

// A shop runs a bulk-buying campaign: the owner publishes it (E2E-038) → two customers pledge and claim their cash
// deposits → the owner confirms both → the campaign fills and closes → a customer opens their claim pass → the owner
// accepts the pass code at the counter.
test("bulk deal: publish, pledges with deposits, owner confirms, campaign fills, claim pass accepted", async ({ owner, customer, customer2 }) => {
  test.slow();
  const title = `Basmati bulk box ${uid()}`;

  // Owner publishes a campaign for 3 units with a ₹50 deposit.
  await owner.goto(MANAGER);
  await owner.getByRole("button", { name: "New campaign" }).click();
  await expect(owner.getByRole("button", { name: /^Make this a bulk-buying campaign/ })).toHaveAttribute("aria-pressed", "true");
  await owner.getByRole("textbox", { name: /^Title/ }).fill(title);
  await owner.getByRole("textbox", { name: "Regular price (₹)" }).fill("200");
  await owner.getByRole("textbox", { name: "Target qty" }).fill("3");
  await owner.getByRole("textbox", { name: "Qty", exact: true }).fill("3");
  await owner.getByRole("textbox", { name: "Unit price ₹", exact: true }).fill("180");
  await owner.getByRole("textbox", { name: "Deposit to join (optional)" }).fill("50");
  await owner.getByRole("button", { name: "In-store pickup" }).click();
  await owner.getByRole("button", { name: "Publish campaign" }).click();
  await expect(owner.getByText("Campaign published 🎉")).toBeVisible();
  await expect(owner).toHaveURL(new RegExp(`${MANAGER}/bd_`));
  const dealPath = new URL(owner.url()).pathname;
  await expect(owner.getByText("0 of 3 confirmed")).toBeVisible();

  // Two customers pledge 2 + 1 and claim cash deposits.
  await pledge(customer, title, 2);
  await pledge(customer2, title, 1);

  // Owner confirms both deposits → 3 of 3 → the campaign closes as fulfilled.
  await owner.goto(dealPath);
  const pledger = (alias: string) => owner.locator("div").filter({ hasText: alias }).filter({ has: owner.getByRole("button", { name: "Confirm", exact: true }) }).last();
  await expectAfterReload(owner, () => pledger("test_customer_two"));
  await pledger("test_customer_one").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(owner.getByText("2 of 3 confirmed")).toBeVisible();
  await pledger("test_customer_two").getByRole("button", { name: "Confirm", exact: true }).click();
  await expectAfterReload(owner, () => owner.getByText(/fulfilled|closed|3 of 3 confirmed/i));

  // Customer 1: the claim pass is in My activity (the claim-pass notification links there).
  await customer.goto("/community/activity");
  const pass = customer.getByRole("button", { name: new RegExp(`${title}.*2 units · STRYT-D-[A-Z0-9]{4}-[A-Z0-9]{4}.*READY`) });
  await expectAfterReload(customer, () => pass);
  const code = ((await pass.innerText()).match(/STRYT-D-[A-Z0-9]{4}-[A-Z0-9]{4}/) ?? [""])[0];
  expect(code).toMatch(/^STRYT-D-/);
  const campaign = customer.getByRole("button", { name: new RegExp(`Fulfilled.*${title}`) });
  await expect(campaign.getByRole("button", { name: "View claim pass" })).toBeVisible();

  // Owner accepts the pass at the counter.
  await owner.goto(MANAGER);
  await owner.getByPlaceholder("STRYT-XXXX-XXXX").fill(code);
  await owner.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(owner.getByText("✓ Pass accepted — 2 units")).toBeVisible();

  // The same pass can't be used twice.
  await owner.getByPlaceholder("STRYT-XXXX-XXXX").fill(code);
  await owner.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(owner.getByText("Already used — this pass was claimed before")).toBeVisible();
});
