import type { Page } from "@playwright/test";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";
import { expect, test } from "../fixtures/staging";

const storefrontPath = `/business/${BUSINESS.id}`;
const profilePath = `${storefrontPath}/manage/profile`;

async function expectStorefront(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: BUSINESS.name })).toBeVisible();
  const sections = page.getByRole("navigation", { name: "Storefront sections" });
  await expect(sections.getByRole("button", { name: /^Services\b/ })).toBeVisible();
  await expect(sections.getByRole("button", { name: /^Photos\b/ })).toBeVisible();
  await expect(sections.getByRole("button", { name: /^Reviews\b/ })).toBeVisible();
  await expect(page.getByText("Test Haircut", { exact: true })).toBeVisible();

  const identity = page.locator(".storefront-identity");
  await expect(identity).toBeVisible();
  expect(await identity.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}

test("owner can manage the business profile and preview the storefront safely", async ({ owner }) => {
  await owner.setViewportSize({ width: 360, height: 800 });
  await owner.goto(profilePath);
  await expectStorefront(owner);
  await expect(owner.getByRole("link", { name: "Edit profile", exact: true })).toHaveAttribute(
    "href", `${storefrontPath}/manage/edit-profile`,
  );

  const settings = owner.getByRole("button", { name: "Profile settings", exact: true });
  await settings.press("Enter");
  const sheet = owner.getByRole("dialog", { name: "Profile settings", exact: true });
  await expect(sheet).toBeVisible();
  for (const label of ["Business settings", "Team & access", "Customer reviews", "Payments"]) {
    await expect(sheet.getByText(label, { exact: true })).toBeVisible();
  }
  await owner.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(settings).toBeFocused();

  await owner.getByRole("link", { name: "Preview as customer", exact: true }).click();
  await expect(owner).toHaveURL(`${profilePath}/preview`);
  await expect(owner.getByText("Customer preview", { exact: true })).toBeVisible();
  await expectStorefront(owner);
  await expect(owner.getByRole("link", { name: "Edit profile", exact: true })).toHaveCount(0);
  await expect(settings).toHaveCount(0);
  await expect(owner.getByRole("button", { name: "Book Appointment", exact: true })).toBeDisabled();

  const sections = owner.getByRole("navigation", { name: "Storefront sections" });
  await sections.getByRole("button", { name: "About", exact: true }).click();
  await expect(owner.getByText("Synthetic staging business — not real.", { exact: true }).last()).toBeVisible();
  await expect(owner.getByRole("button", { name: "Open directions in Google Maps" })).toHaveCount(0);
  await sections.getByRole("button", { name: "Reviews", exact: true }).click();
  await expect(owner.getByRole("button", { name: "Write a review", exact: true })).toHaveCount(0);
  await owner.getByRole("link", { name: "Back to profile", exact: true }).click();
  await expect(owner).toHaveURL(profilePath);
  await expect(settings).toBeVisible();
  await owner.setViewportSize({ width: 1366, height: 900 });
  await owner.getByRole("navigation", { name: "Storefront sections" }).getByRole("button", { name: /^Services\b/ }).click();
  await expectStorefront(owner);
});

test("customers can book from the public storefront", async ({ customer }) => {
  await customer.setViewportSize({ width: 360, height: 800 });
  await customer.goto(storefrontPath);
  await expectStorefront(customer);
  await expect(customer.getByRole("button", { name: "Directions", exact: true })).toBeEnabled();
  await expect(customer.getByRole("link", { name: "Edit profile", exact: true })).toHaveCount(0);
  await expect(customer.getByRole("button", { name: "Profile settings", exact: true })).toHaveCount(0);
  await customer.getByRole("button", { name: "Book Appointment", exact: true }).click();
  await expect(customer.getByRole("button", { name: /^Test Haircut ₹/ })).toBeVisible();
});

test("scoped staff cannot enter the owner profile or preview", async ({ staffQueue }) => {
  await staffQueue.goto(profilePath);
  await expect(staffQueue).toHaveURL(`${storefrontPath}/manage`);
  await staffQueue.goto(`${profilePath}/preview`);
  await expect(staffQueue).toHaveURL(`${storefrontPath}/manage`);
});
