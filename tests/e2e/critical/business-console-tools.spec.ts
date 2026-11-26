import { expect, test } from "../fixtures/staging";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

const base = `/business/${BUSINESS.id}/manage`;

test("owner can open replacement tools and the Business hub stays available", async ({ owner }) => {
  await owner.goto(base);
  await owner.getByRole("button", { name: "All tools", exact: true }).click();
  const tools = owner.getByRole("dialog", { name: "All tools" });
  await expect(tools.getByRole("link", { name: "Store tools", exact: true })).toBeVisible();
  await expect(tools.getByRole("link", { name: "Customer reachouts", exact: true })).toBeVisible();
  await expect(tools.getByRole("link", { name: "Payments", exact: true })).toBeVisible();
  await tools.getByRole("link", { name: "Customer reachouts", exact: true }).click();
  await expect(owner).toHaveURL(`${base}/inbox`);
  await owner.goto(`${base}/business`);
  await expect(owner).toHaveURL(`${base}/business`);
  await expect(owner.getByText("Money, customers, and growth")).toBeVisible();
});

test("queue staff can open Queue and switch accounts without an owner Profile link", async ({ staffQueue }) => {
  await staffQueue.goto(base);
  await staffQueue.getByRole("button", { name: "All tools", exact: true }).click();
  const tools = staffQueue.getByRole("dialog", { name: "All tools" });
  await expect(tools.getByRole("link", { name: /queue/i })).toBeVisible();
  await expect(tools.getByRole("link", { name: "Customer reachouts", exact: true })).toHaveCount(0);
  await expect(tools.getByRole("link", { name: "Profile", exact: true })).toHaveCount(0);
  await staffQueue.keyboard.press("Escape");
  const switchAccount = staffQueue.locator(".screen-scroll").getByRole("button", { name: "Switch account", exact: true });
  await expect(switchAccount).toBeVisible();
  await switchAccount.click();
  await expect(staffQueue.getByRole("dialog", { name: "Switch account" })).toBeVisible();
  await staffQueue.goto(`${base}/profile`);
  await expect(staffQueue).toHaveURL(base);
  await staffQueue.goto(`${base}/queue`);
  await expect(staffQueue.getByText("Walk-in queue", { exact: true })).toBeVisible();
});
