import { test, expect, expectAfterReload } from "../fixtures/staging";
import { SALON as B, QUEUE, leaveIfQueued, joinQueue as join } from "../fixtures/queue";

// Customer joins → a guest sees the right number ahead → owner calls next → customer is told it's their turn →
// owner marks arrived and served → customer claims a cash payment → owner confirms → the visit is paid.
test("queue: join, call, serve, pay claim and owner confirmation", async ({ customer, customer2, guest, owner }) => {
  await leaveIfQueued(customer);
  await leaveIfQueued(customer2);
  await owner.goto(QUEUE);
  await expect(owner.getByText("Queue is empty 🎉")).toBeVisible();

  await join(customer);
  await customer.goto("/queues");
  await expect(customer.getByText("No one ahead of you")).toBeVisible();

  await join(customer2);
  await customer2.goto("/queues");
  await expect(customer2.getByText(/You're #\s*2\s*·\s*1\s*ahead/)).toBeVisible();

  // A guest looking at the shop sees two people ahead.
  await guest.goto(B);
  await expect(guest.getByText("2 ahead")).toBeVisible();

  // Owner calls the first customer.
  await owner.goto(QUEUE);
  await expect(owner.getByText("Up next")).toBeVisible();
  await expect(owner.getByText("Test Customer Two")).toBeVisible();
  await owner.getByRole("button", { name: "Call next — Test Customer One" }).click();
  await expect(owner.getByText("🔔 Called Test Customer One")).toBeVisible();

  await customer.goto("/queues");
  await expectAfterReload(customer, () => customer.getByText("🔔 It's your turn — head in now!"));
  await customer.goto("/notifications");
  await expect(customer.getByText("It's your turn! 🔔").first()).toBeVisible();
  await customer2.goto("/queues");
  await expectAfterReload(customer2, () => customer2.getByText("No one ahead of you"));

  // Owner: arrived → done.
  await owner.getByRole("button", { name: "Arrived" }).click();
  await owner.getByRole("button", { name: "Done" }).click();
  await expect(owner.getByText("Recently served")).toBeVisible();

  // Customer: served, claims a cash payment.
  await customer.goto("/queues");
  await expectAfterReload(customer, () => customer.getByText("✓ Served"));
  await customer.getByRole("button", { name: "Pay now" }).click();
  await customer.getByPlaceholder("Enter amount").fill("250");
  await customer.getByRole("button", { name: "I've paid in cash" }).click();
  await expect(customer.getByText("Awaiting confirmation")).toBeVisible();

  // Owner confirms the claim.
  await expectAfterReload(owner, () => owner.getByText("Claims CASH payment · ₹250"));
  await owner.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(owner.getByText("Claims CASH payment · ₹250")).toHaveCount(0);

  // Customer: the paid visit moves to History with a PAID badge.
  await customer.goto("/queues");
  await expectAfterReload(customer, () => customer.getByText("No active queues"));
  await customer.getByRole("button", { name: "🕘 History" }).click();
  await expect(customer.getByText("PAID", { exact: true }).first()).toBeVisible();

  // Tidy: serve customer two so the board is empty for the next run.
  await owner.goto(QUEUE);
  await owner.getByRole("button", { name: "Call next — Test Customer Two" }).click();
  await owner.getByRole("button", { name: "Arrived" }).click();
  await owner.getByRole("button", { name: "Done" }).click();
  await expect(owner.getByText("Queue is empty 🎉")).toBeVisible();
});

// E2E-011: a customer at the front of the line must not be told someone is ahead of them.
test("queue: the shop page shows a queued customer their own number ahead, not the whole line", async ({ customer, owner }) => {
  await leaveIfQueued(customer);
  await join(customer);
  await customer.goto(B);
  await expect(customer.getByText("You're #1")).toBeVisible();
  await expect(customer.getByText(/^\d+ ahead$/)).toHaveCount(0);
  await leaveIfQueued(customer);
  await owner.goto(QUEUE);
});
