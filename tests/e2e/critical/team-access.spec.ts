import type { Page } from "@playwright/test";
import { test, expect, expectAfterReload } from "../fixtures/staging";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

const B = `/business/${BUSINESS.id}`;
const GRANTEE = "test_customer_two";

async function openTeamSheet(owner: Page) {
  await owner.goto("/account/business-access");
  await owner.getByRole("button", { name: /^Test Salon One Add team members/ }).click();
  await expect(owner.getByRole("heading", { name: "Test Salon One — team & access" })).toBeVisible();
}

/** The grantee's active grant (revoked grants stay listed further down as history, without a Revoke button). */
const grantRow = (owner: Page) =>
  owner.locator("div.card").filter({ has: owner.getByText(GRANTEE, { exact: true }) }).filter({ has: owner.getByRole("button", { name: "Revoke" }) });

async function revokeIfGranted(owner: Page) {
  await openTeamSheet(owner);
  await expect(owner.getByText("People with access")).toBeVisible();
  if (await grantRow(owner).count()) {
    await grantRow(owner).getByRole("button", { name: "Revoke" }).click();
    await owner.getByRole("button", { name: "Yes, remove access" }).click();
    await expect(grantRow(owner)).toHaveCount(0);
  }
}

// Owner grants a customer the Queue scope only → the new team member is notified, sees the business in their access
// list, can run the queue console, and is kept out of screens outside that scope → owner revokes → access is gone.
test("team access: owner grants queue-only access, staff is limited to it, revoke removes it", async ({ owner, customer2 }) => {
  await revokeIfGranted(owner);

  // Grant: Front desk (Appointments + Queue) with Appointments switched off leaves Queue only.
  await owner.getByPlaceholder(/98765 43210/).fill("9000000002");
  await owner.getByRole("button", { name: "Front desk", exact: true }).click();
  await owner.getByRole("button", { name: /^Appointments View and manage/ }).click();
  await expect(owner.getByRole("button", { name: /^Appointments View and manage/ })).toHaveAttribute("aria-pressed", "false");
  await expect(owner.getByRole("button", { name: /^Queue Call, serve/ })).toHaveAttribute("aria-pressed", "true");
  await owner.getByRole("button", { name: "Add to team" }).click();
  await expect(grantRow(owner)).toBeVisible();
  await expect(grantRow(owner).getByText("Queue", { exact: true })).toBeVisible();

  // Staff side: notified, business listed with the Queue scope, console opens with team-member status.
  await customer2.goto("/notifications");
  await expectAfterReload(customer2, () => customer2.getByText("Team access granted").first());
  await customer2.goto("/account/business-access");
  await customer2.getByRole("button", { name: "Test Salon One Queue" }).click();
  await expect(customer2).toHaveURL(new RegExp(`${B}/manage$`));
  await expect(customer2.getByRole("status").filter({ hasText: "Team member" })).toBeVisible();

  await customer2.goto(`${B}/manage/queue`);
  await expect(customer2).toHaveURL(new RegExp(`${B}/manage/queue$`));
  await expect(customer2.getByText("Walk-in queue")).toBeVisible();

  // Outside the scope: bounced back to the console home.
  for (const screen of ["appointments", "settings", "catalog", "payments"]) {
    await customer2.goto(`${B}/manage/${screen}`);
    await expect(customer2, `staff with Queue scope must not open ${screen}`).toHaveURL(new RegExp(`${B}/manage$`));
  }

  // Revoke: the grant disappears for the owner, and the staff member loses the console.
  await revokeIfGranted(owner);
  await customer2.goto(`${B}/manage/queue`);
  await expect(customer2).not.toHaveURL(new RegExp(`${B}/manage`));
  await customer2.goto("/account/business-access");
  await expect(customer2.getByText("Businesses you can access")).toHaveCount(0);
});
