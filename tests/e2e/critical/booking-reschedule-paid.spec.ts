import { test, expect, uid } from "../fixtures/staging";
import { bookSlot, pickDay } from "../fixtures/booking";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

// A booking paid in cash (claimed by the customer, confirmed by the owner) is rescheduled: the new booking keeps
// the payment and the original moves to cancelled.
test("booking: rescheduling a paid booking keeps the payment and cancels the original", async ({ customer, owner }, testInfo) => {
  const note = `e2e resched ${uid()}`;
  const time = `${10 + testInfo.repeatEachIndex}:00 AM`;
  const newTime = `${10 + testInfo.repeatEachIndex}:30 AM`;

  await bookSlot(customer, { target: `/business/${BUSINESS.id}`, item: "Test Hair Spa", dayOffset: 4, time, note });
  await expect(customer.getByText(/booked for/i)).toBeVisible();

  // Owner accepts.
  await owner.goto(`/business/${BUSINESS.id}/manage/appointments`);
  const ownerCard = owner.locator("div.card.queue-row-enter").filter({ hasText: note });
  await ownerCard.getByRole("button", { name: "Accept" }).click();
  await owner.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(ownerCard.getByText("Confirmed")).toBeVisible();

  // Customer claims a cash payment.
  await customer.goto("/appointments");
  const mine = () => customer.locator("div.card").filter({ hasText: note }).last();
  await mine().getByRole("button", { name: /^Pay ₹800/ }).click();
  await customer.getByRole("button", { name: "I've paid in cash" }).click();
  await expect(mine().getByText(/Waiting for confirmation/)).toBeVisible();

  // Owner confirms it was received.
  await owner.reload();
  await ownerCard.getByRole("button", { name: "Confirm received" }).click();
  await owner.getByRole("button", { name: "Yes, confirm received" }).click();
  await expect(ownerCard.getByRole("button", { name: "Confirm received" })).toHaveCount(0);

  // Customer reschedules to another slot.
  await customer.reload();
  await expect(mine().getByText("PAID", { exact: true })).toBeVisible();
  await mine().getByRole("button", { name: "Reschedule" }).click();
  await pickDay(customer, 3);
  await customer.getByRole("button", { name: new RegExp(`^${newTime}`) }).click();
  await customer.getByRole("button", { name: `Reschedule to ${newTime}` }).click();
  await expect(customer.getByText(/Rescheduled to/)).toBeVisible();

  // New booking: same note, new time, still PAID, no Pay button. Original: in Past & cancelled.
  await customer.reload();
  const upcoming = customer.locator("div.card").filter({ hasText: note }).filter({ hasText: newTime }).last();
  await expect(upcoming.getByText("PAID", { exact: true })).toBeVisible();
  await expect(upcoming.getByRole("button", { name: /^Pay ₹/ })).toHaveCount(0);
  await customer.getByRole("button", { name: /Past & cancelled/ }).click();
  const original = customer.locator("div.card").filter({ hasText: note }).filter({ hasText: time }).last();
  await expect(original.getByText(/Cancelled/i).first()).toBeVisible();
});
