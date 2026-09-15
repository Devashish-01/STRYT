import type { Page } from "@playwright/test";
import { test, expect, uid, expectAfterReload } from "../fixtures/staging";

/** The form fields' labels aren't linked to their inputs (E2E-033), so fields are found through their `.field` box. */
const field = (page: Page, label: string) => page.locator(".field").filter({ has: page.locator("label", { hasText: label }) }).locator("input, textarea").first();

// A customer lists a café → submits for review → an admin approves it (hours shown readably, E2E-032) → the new
// owner adds a menu item → another customer finds the café in search and sees the item on its page.
test("business onboarding: list a shop, admin approves, owner adds an item, customers find it", async ({ customer2, admin, customer }) => {
  test.slow();
  const name = `E2E Bakery ${uid()}`;
  const item = `Chocolate Croissant ${uid()}`;
  await customer2.context().grantPermissions(["geolocation"]);
  await customer2.context().setGeolocation({ latitude: 18.5362, longitude: 73.8939 });

  // Step 1 — basics.
  await customer2.goto("/onboard/business");
  await customer2.getByPlaceholder("e.g. Spice Route Kitchen").fill(name);
  await customer2.getByRole("button", { name: "🍔 Food & Beverage" }).click();
  await customer2.getByRole("button", { name: "Café & Bakery" }).click();
  await customer2.getByRole("button", { name: "Continue" }).click();

  // Step 2 — location.
  await expect(customer2.getByText("Step 2 of 4 • Location")).toBeVisible();
  await customer2.getByPlaceholder("Shop no, lane, area").fill("3 Test Lane, Test Nagar");
  await customer2.getByPlaceholder("e.g. Pune").fill("Pune");
  await customer2.getByPlaceholder("411001").fill("411001");
  await customer2.getByRole("button", { name: "Continue" }).click();

  // Step 3 — photos (optional).
  await expect(customer2.getByText("Step 3 of 4 • Photos")).toBeVisible();
  await customer2.getByRole("button", { name: "Continue" }).click();

  // Step 4 — contact and hours.
  await expect(customer2.getByText("Step 4 of 4 • Contact")).toBeVisible();
  await customer2.getByPlaceholder("98765 43210").fill("9000000002");
  await customer2.getByRole("button", { name: "Submit for review" }).click();
  await expect(customer2.getByRole("heading", { name: "Submitted for review" })).toBeVisible();
  await expect(customer2.getByText(new RegExp(`${name}.*Under review`))).toBeVisible();

  // Not public yet.
  await customer.goto(`/search`);
  await customer.getByRole("textbox").first().fill(name);
  await expect(customer.getByText(name)).toHaveCount(0);

  // Admin approves from the queue; the hours read like hours, not JSON.
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "Queue", exact: true }).click();
  const card = admin.locator("div.card").filter({ hasText: name }).last();
  await expectAfterReload(admin, async () => {
    await admin.getByRole("button", { name: "Queue", exact: true }).click();
    return admin.locator("div.card").filter({ hasText: name });
  });
  await expect(card.getByText(/Mon–Sun 9:00 AM–9:00 PM/)).toBeVisible();
  await expect(card.getByText(/"mode":"weekly"/)).toHaveCount(0);
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(admin.locator("div.card").filter({ hasText: name })).toHaveCount(0);

  // Owner: approval notification, then adds a menu item from the console.
  await customer2.goto("/notifications");
  await expectAfterReload(customer2, () => customer2.getByText("Business Approved ✓").first());
  await customer2.goto("/manage");
  const hubCard = customer2.locator("div.card").filter({ hasText: name });
  await expect(hubCard.getByText("● Live")).toBeVisible();
  await hubCard.getByRole("button", { name: /^Manage/ }).click();
  await expect(customer2).toHaveURL(/\/business\/b_[a-z0-9]+\/manage/);
  const bizPath = new URL(customer2.url()).pathname.replace(/\/manage.*$/, "");
  await customer2.goto(`${bizPath}/manage/catalog`);
  await customer2.getByRole("button", { name: "Add first listing" }).click();
  await field(customer2, "Name *").fill(item);
  await field(customer2, "Price ₹ *").fill("120");
  await customer2.getByRole("button", { name: "Add listing" }).click();
  await expect(customer2.getByText(item)).toBeVisible();

  // A customer finds the café in search and sees the item.
  await customer.goto("/search");
  await customer.getByRole("textbox").first().fill(name);
  await expectAfterReload(customer, async () => {
    await customer.getByRole("textbox").first().fill(name);
    return customer.getByText(name);
  });
  await customer.goto(bizPath);
  await expect(customer.getByRole("heading", { name })).toBeVisible();
  await expect(customer.getByText(item)).toBeVisible();
});
