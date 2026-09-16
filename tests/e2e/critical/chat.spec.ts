import type { Page } from "@playwright/test";
import { test, expect, uid, expectAfterReload, loadStagingEnv } from "../fixtures/staging";
import { stagingQuery, lit, hasDb } from "../fixtures/db";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

// Needs migration 20260973 (chat send fix, E2E-014): applied on staging 2026-09-16, production apply pending owner approval.
const CUSTOMER2_ID = "00000000-0000-4000-8000-000000000002";

async function openShopChat(customer: Page) {
  await customer.goto(`/business/${BUSINESS.id}`);
  await expect(customer.getByRole("heading", { name: "Test Salon One" })).toBeVisible();
  await customer.getByRole("button", { name: "Message" }).click();
  await expect(customer).toHaveURL(/\/chat\/cv_/);
  // The composer only sends once the conversation has loaded (the header names the shop).
  await expect(customer.getByRole("button", { name: "Test Salon One View profile" })).toBeVisible();
  return new URL(customer.url()).pathname.split("/").pop() as string;
}

async function send(page: Page, text: string) {
  const box = page.getByPlaceholder("Type a message…");
  await box.fill(text);
  await box.press("Enter");
  await expect(page.getByText(text)).toBeVisible();
  await expect(box).toHaveValue("");
}

// Customer messages a shop → owner is notified and sees the conversation with the message → owner opens it (unread
// clears) and replies → customer sees the reply.
test("chat: customer and owner exchange messages; opening the thread clears unread", async ({ customer2, owner }) => {
  test.skip(!hasDb(), "needs the staging DB helper token to read the unread flag");
  const hello = `Hello salon ${uid()}`;
  const reply = `Hi, how can we help? ${uid()}`;

  const convId = await openShopChat(customer2);
  await send(customer2, hello);

  // The owner's side of the conversation is unread (conversations store it per participant).
  const unreadForOwner = async () => {
    const [row] = await stagingQuery<{ unread: boolean }>(
      `select case when participant_a = ${lit(CUSTOMER2_ID)} then has_unread_b else has_unread_a end as unread from public.conversations where id = ${lit(convId)}`,
    );
    return row?.unread;
  };
  await expect.poll(unreadForOwner).toBe(true);

  // Owner: notified, conversation listed with the latest message.
  await owner.goto("/notifications");
  await expectAfterReload(owner, () => owner.getByText(hello));
  await owner.goto("/chats");
  const row = owner.getByRole("button", { name: new RegExp(`test_customer_two.*${hello}`) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(owner).toHaveURL(new RegExp(`/chat/${convId}$`));
  await expect(owner.getByRole("button", { name: /test_customer_two View profile/i })).toBeVisible();
  await expect(owner.getByText(hello)).toBeVisible();
  await expect.poll(unreadForOwner).toBe(false);

  await send(owner, reply);

  // Customer sees the reply.
  await expectAfterReload(customer2, () => customer2.getByText(reply));
  await expect(customer2.getByText(hello)).toBeVisible();
});

// E2E-015: a photo sent in chat must reach the other side as a stored image.
test("chat: a photo sent by the customer arrives for the owner", async ({ customer2, owner }) => {
  const convId = await openShopChat(customer2);
  // The photo uploads as soon as it is picked.
  const uploaded = customer2.waitForResponse((r) => r.url().includes("/storage/v1/object/uploads/") && r.request().method() === "POST");
  await customer2.locator('input[type="file"]').setInputFiles("public/icon-192.png");
  expect((await uploaded).status(), "storage upload status").toBeLessThan(300);
  await expect(customer2.getByRole("button", { name: "Remove photo" })).toBeVisible();
  await customer2.locator("textarea + button").click();
  const env = loadStagingEnv();
  // .last(): the thread keeps photos from earlier runs, so only the one just sent is the subject here.
  await expect(customer2.locator(`img[src*="${new URL(env.VITE_SUPABASE_URL).host}/storage/v1/object/public/uploads/"]`).last()).toBeVisible();
  await owner.goto(`/chat/${convId}`);
  await expect(owner.locator('img[src*="/storage/v1/object/public/uploads/"]').last()).toBeVisible();
});

// E2E-013: an idle open thread must not keep hitting the API.
test("chat: an idle open thread does not flood the API", async ({ customer2 }) => {
  await openShopChat(customer2);
  await expect(customer2.getByPlaceholder("Type a message…")).toBeVisible();
  // Let the thread settle, then count REST calls over a fixed observation window.
  await customer2.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  let calls = 0;
  customer2.on("request", (r) => { if (r.url().includes("/rest/v1/")) calls++; });
  await customer2.waitForTimeout(5_000); // observation window, not a sync wait
  expect(calls, "REST calls in 5s from an idle open chat").toBeLessThan(15);
});
