import type { Page } from "@playwright/test";
import { test, expect, uid, personaPage, expectAfterReload } from "../fixtures/staging";
import { stagingQuery, lit, hasDb } from "../fixtures/db";

// 20260990, end to end through the app: five different people report a community post, it hides itself, its author
// is told why and everyone else stops being sent it; a moderator chooses No action, and it comes back with every
// report closed. Along the way, a second report from the same person is a duplicate and is said to be one.
//
// Six personas take part: customer1 writes the post; customer2, owner1, both staff personas and provider1 report it.
// The post is left on staging afterwards, restored and harmless, the way the other specs leave what they create —
// the E2E DB helper is read-only by design.
test("community moderation: five people hide a post, the author is told, a moderator restores it", async ({
  browser,
  customer,
  customer2,
  admin,
}) => {
  test.skip(!hasDb(), "needs the staging DB helper token to read state");
  test.setTimeout(360_000);
  const title = `Moderation probe ${uid()}`;

  // customer1 publishes through the composer.
  await customer.goto("/community/new");
  await customer.locator(".flair-tile", { hasText: "Lost & Found" }).click();
  await customer.locator("#compose-title").fill(title);
  await customer.locator("#compose-body").fill("Left a blue umbrella near the bus stop this morning.");
  await customer.getByLabel("Last seen location").fill("The bus stop");
  await customer.getByRole("button", { name: /Post to your street/ }).click();
  // The composer itself lives at /community/new, which the plain pattern also matches — wait for the post's own URL.
  await customer.waitForURL((u) => /^\/community\/[^/]+$/.test(u.pathname) && u.pathname !== "/community/new", { timeout: 30_000 });
  const postId = new URL(customer.url()).pathname.split("/").pop()!;

  const hiddenReason = async () =>
    (await stagingQuery<{ r: string | null }>(`select hidden_reason as r from public.community_posts where id = ${lit(postId)}`))[0]?.r ?? null;

  const report = async (page: Page) => {
    await page.goto(`/community/${postId}`);
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole("button", { name: "Report post" }).click();
    await page.getByRole("button", { name: "Spam or misleading" }).click();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText("Report submitted. Thank you.")).toBeVisible();
  };

  // customer2 reports it — and a second report from the same person is a duplicate, and says so.
  await report(customer2);
  await customer2.getByRole("button", { name: "Report post" }).click();
  await customer2.getByRole("button", { name: "Spam or misleading" }).click();
  await customer2.getByRole("button", { name: "Submit report" }).click();
  await expect(customer2.getByText(/You've already reported this/)).toBeVisible();

  // Three more people: four in all, and it is still up.
  for (const key of ["owner1", "staff_queue", "staff_appointments"] as const) {
    const { context, page } = await personaPage(browser, key);
    try { await report(page); } finally { await context.close(); }
  }
  expect(await hiddenReason()).toBeNull();

  // The fifth different person hides it.
  {
    const { context, page } = await personaPage(browser, "provider1");
    try { await report(page); } finally { await context.close(); }
  }
  await expect.poll(hiddenReason).toBe("REPORTS");

  // The author still sees it, and why.
  await customer.goto(`/community/${postId}`);
  await expect(customer.getByText(title)).toBeVisible();
  await expect(customer.getByText(/Under review — only you and moderators can see this post/)).toBeVisible();

  // Nobody else is sent it.
  await customer2.goto(`/community/${postId}`);
  await customer2.waitForLoadState("networkidle");
  await expect(customer2.getByText(title)).toHaveCount(0);

  // The moderator sees one card for five reports, marked hidden, and chooses No action.
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "Reports", exact: true }).click();
  const card = () => admin.locator("div.card").filter({ hasText: title });
  await expectAfterReload(admin, async () => {
    await admin.getByRole("button", { name: "Reports", exact: true }).click();
    return card();
  });
  await expect(card()).toHaveCount(1);
  await expect(card().getByText("Hidden after reports")).toBeVisible();
  await expect(card().getByText(/reported by 5 people/)).toBeVisible();
  await card().getByRole("button", { name: "No action" }).click();
  await expect(card()).toHaveCount(0);

  // Visible again, every report closed as reviewed.
  const [state] = await stagingQuery<{ hidden: boolean; open: number; dismissed: number }>(
    `select (select hidden_at is not null from public.community_posts where id = ${lit(postId)}) as hidden,
            (select count(*)::int from public.reports where target_id = ${lit(postId)} and status in ('OPEN','REVIEWING')) as open,
            (select count(*)::int from public.reports where target_id = ${lit(postId)} and status = 'DISMISSED') as dismissed`,
  );
  expect(state).toEqual({ hidden: false, open: 0, dismissed: 5 });
  await customer2.goto(`/community/${postId}`);
  await expect(customer2.getByText(title)).toBeVisible();
});
