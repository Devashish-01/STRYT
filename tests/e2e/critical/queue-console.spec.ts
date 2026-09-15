import { test, expect, expectAfterReload } from "../fixtures/staging";
import { stagingQuery, lit, hasDb } from "../fixtures/db";
import { QUEUE, leaveIfQueued, joinQueue, openQueueConsole } from "../fixtures/queue";

// Needs migration 20260980 (applied on staging 2026-09-16; production apply pending owner approval).
const OWNER_ID = "00000000-0000-4000-8000-000000000003";

// Owner messages a called customer (E2E-041) → removes them as a no-show: the customer is told their place was
// released and sees "Missed your turn", the owner is not told the customer "left" (M3) → owner serves the next
// customer and requests payment, a second request inside the cooldown is refused (M7) → the customer can't claim a
// payment without an amount (Q6) → closing the queue with someone waiting asks first (M1) and removes them.
test("queue console: message, no-show, payment request cooldown, close confirmation", async ({ customer, customer2, owner }) => {
  test.slow();
  const startedAt = new Date().toISOString();
  await leaveIfQueued(customer);
  await leaveIfQueued(customer2);
  await openQueueConsole(owner);

  await joinQueue(customer);
  await joinQueue(customer2);

  // Call customer one and message them from the board.
  await owner.goto(QUEUE);
  await expectAfterReload(owner, () => owner.getByRole("button", { name: "Call next — Test Customer One" }));
  await owner.getByRole("button", { name: "Call next — Test Customer One" }).click();
  await expect(owner.getByText("🔔 Called Test Customer One")).toBeVisible();
  await owner.getByRole("button", { name: "Message Test Customer One" }).click();
  await expect(owner).toHaveURL(/\/chat\/cv_/);
  await expect(owner.getByRole("button", { name: /test_customer_one View profile/i })).toBeVisible();

  // No-show.
  await owner.goto(QUEUE);
  await owner.getByRole("button", { name: "Remove Test Customer One (no-show)" }).click();
  await expect(owner.getByText("Removed Test Customer One — marked as a no-show")).toBeVisible();

  await customer.goto("/queues");
  await customer.getByRole("button", { name: "🕘 History" }).click();
  await expectAfterReload(customer, async () => {
    await customer.getByRole("button", { name: "🕘 History" }).click();
    return customer.getByText("Missed your turn").first();
  });
  await customer.goto("/notifications");
  await expectAfterReload(customer, () => customer.getByText("Removed from the queue").first());

  await owner.getByRole("button", { name: "History", exact: true }).click();
  await expectAfterReload(owner, async () => {
    await owner.getByRole("button", { name: "History", exact: true }).click();
    return owner.getByText("No-show").first();
  });
  if (hasDb()) {
    const [{ n }] = await stagingQuery<{ n: number }>(
      `select count(*)::int n from public.notifications where user_id = ${lit(OWNER_ID)} and body = 'Test Customer One left before paying.' and created_at >= ${lit(startedAt)}`,
    );
    expect(n, "owner told the customer left after removing a no-show").toBe(0);
  }

  // Serve customer two and request payment twice.
  await owner.goto(QUEUE);
  await owner.getByRole("button", { name: "Call next — Test Customer Two" }).click();
  await owner.getByRole("button", { name: "Arrived" }).click();
  await owner.getByRole("button", { name: "Done" }).click();
  await expect(owner.getByText("Recently served")).toBeVisible();
  const requestPayment = owner.getByRole("button", { name: "🔔 Request payment" }).first();
  await requestPayment.click();
  await expect(owner.getByText("🔔 Payment request sent — test_customer_two")).toBeVisible();
  await expect(requestPayment).toBeEnabled();
  await requestPayment.click();
  await expect(owner.getByText("A payment reminder was already sent in the last 10 minutes.")).toBeVisible();

  await customer2.goto("/notifications");
  await expectAfterReload(customer2, () => customer2.getByText("Test Salon One requested payment for your visit.").first());

  // Customer two: a claim needs the amount; with it, the owner confirms.
  await customer2.goto("/queues");
  await expectAfterReload(customer2, () => customer2.getByRole("button", { name: "Pay now" }).first());
  await customer2.getByRole("button", { name: "Pay now" }).first().click();
  await customer2.getByRole("button", { name: "I've paid in cash" }).click();
  await expect(customer2.getByText("Enter the amount you paid")).toBeVisible();
  await customer2.getByPlaceholder("Enter amount").fill("120");
  await customer2.getByRole("button", { name: "I've paid in cash" }).click();
  await expect(customer2.getByText("Awaiting confirmation")).toBeVisible();
  await owner.goto(QUEUE);
  await expectAfterReload(owner, () => owner.getByText("Claims CASH payment · ₹120"));
  await owner.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(owner.getByText("Claims CASH payment · ₹120")).toHaveCount(0);

  // Closing with someone still waiting asks first.
  await joinQueue(customer);
  await owner.goto(QUEUE);
  await expectAfterReload(owner, () => owner.getByRole("button", { name: "Call next — Test Customer One" }));
  const toggle = owner.getByRole("button", { name: /^Queue is (ON|OFF)/ });
  await toggle.click();
  const dialog = owner.getByRole("dialog", { name: "Close the queue?" });
  await expect(dialog.getByText("1 customer still in line will be removed and notified.")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep queue open" }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await owner.getByRole("dialog", { name: "Close the queue?" }).getByRole("button", { name: "Close queue and remove 1" }).click();
  await expect(owner.getByText("Queue closed")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await customer.goto("/queues");
  await customer.getByRole("button", { name: "🕘 History" }).click();
  await expectAfterReload(customer, async () => {
    await customer.getByRole("button", { name: "🕘 History" }).click();
    return customer.getByText("Queue closed by shop").first();
  });

  // Re-opening doesn't ask.
  await owner.goto(QUEUE);
  await owner.getByRole("button", { name: /^Queue is (ON|OFF)/ }).click();
  await expect(owner.getByText("Queue is now open")).toBeVisible();
  await expect(owner.getByRole("dialog", { name: "Close the queue?" })).toHaveCount(0);
});
