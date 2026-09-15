import { test, expect, uid } from "../fixtures/staging";
import { bookSlot } from "../fixtures/booking";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

const OWNER_INBOX = `/notifications?scope=BUSINESS&id=${BUSINESS.id}`;

// Owner declines from the booking-request notification with a reason → the customer sees that reason in the
// notification and on the booking.
test("booking: owner declines from the notification with a reason, customer sees it", async ({ customer, owner }, testInfo) => {
  const note = `e2e decline ${uid()}`;
  const time = `${1 + testInfo.repeatEachIndex}:00 PM`;
  const reason = `Stylist away ${uid()}`;
  await bookSlot(customer, { target: `/business/${BUSINESS.id}`, item: "Test Beard Trim", dayOffset: 5, time, note });
  await expect(customer.getByText(/booked for/i)).toBeVisible();

  await owner.goto(OWNER_INBOX);
  const request = owner.getByRole("button", { name: new RegExp(`New booking request.*Test Beard Trim.*${time}.*New`) }).first();
  await request.getByRole("button", { name: "Decline" }).click();
  await expect(owner.getByText("Leave it blank and they'll be asked to try another slot.")).toBeVisible();
  await owner.getByPlaceholder(/fully booked/).fill(reason);
  await owner.getByRole("button", { name: "Decline", exact: true }).last().click();
  await expect(owner.getByPlaceholder(/fully booked/)).toHaveCount(0);

  await customer.goto("/notifications");
  const declined = customer.getByRole("button", { name: new RegExp(`Booking declined.*${time}.*Declined`) }).first();
  await expect(declined).toBeVisible({ timeout: 20_000 });
  await expect(declined.getByText(reason)).toBeVisible();

  await customer.goto("/appointments");
  await customer.getByRole("button", { name: /Past & cancelled/ }).click();
  const card = customer.locator("div.card").filter({ hasText: note }).last();
  await expect(card.getByText(`Declined by Test Salon One`)).toBeVisible();
  await expect(card.getByText(reason)).toBeVisible();
});

// Blank reason → the owner is told the customer will be asked to try another slot; the customer must see that.
test("booking: a decline without a reason asks the customer to try another slot", async ({ customer, owner }, testInfo) => {
  const note = `e2e decline blank ${uid()}`;
  const time = `${5 + testInfo.repeatEachIndex}:00 PM`;
  await bookSlot(customer, { target: `/business/${BUSINESS.id}`, item: "Test Beard Trim", dayOffset: 5, time, note });
  await expect(customer.getByText(/booked for/i)).toBeVisible();

  await owner.goto(OWNER_INBOX);
  const request = owner.getByRole("button", { name: new RegExp(`New booking request.*Test Beard Trim.*${time}.*New`) }).first();
  await request.getByRole("button", { name: "Decline" }).click();
  await owner.getByRole("button", { name: "Decline", exact: true }).last().click();
  await expect(owner.getByPlaceholder(/fully booked/)).toHaveCount(0);

  await customer.goto("/notifications");
  const declined = customer.getByRole("button", { name: new RegExp(`Booking declined.*${time}.*Declined`) }).first();
  await expect(declined).toBeVisible({ timeout: 20_000 });
  await expect(declined.getByText(/try another slot/i)).toBeVisible();
  await customer.goto("/appointments");
  await customer.getByRole("button", { name: /Past & cancelled/ }).click();
  await expect(customer.locator("div.card").filter({ hasText: note }).last().getByText(/try another slot/i)).toBeVisible();
});

// E2E-007: once handled, the owner's notification must stop offering Accept/Decline.
test("booking: a handled booking request no longer offers Accept/Decline", async ({ customer, owner }, testInfo) => {
  const note = `e2e stale ${uid()}`;
  const time = `${8 + testInfo.repeatEachIndex}:30 PM`;
  await bookSlot(customer, { target: `/business/${BUSINESS.id}`, item: "Test Beard Trim", dayOffset: 5, time, note });
  await expect(customer.getByText(/booked for/i)).toBeVisible();

  await owner.goto(`/business/${BUSINESS.id}/manage/appointments`);
  const card = owner.locator("div.card.queue-row-enter").filter({ hasText: note });
  await card.getByRole("button", { name: "Decline" }).click();
  await owner.getByRole("button", { name: "Decline", exact: true }).last().click();
  await expect(card).toHaveCount(0);

  await owner.goto(OWNER_INBOX);
  const request = owner.getByRole("button", { name: new RegExp(`New booking request.*Test Beard Trim.*${time}`) }).first();
  await expect(request).toBeVisible({ timeout: 20_000 });
  await expect(request.getByRole("button", { name: "Accept" })).toHaveCount(0);
});
