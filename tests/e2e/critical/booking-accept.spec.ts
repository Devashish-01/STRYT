import { test, expect, uid } from "../fixtures/staging";
import { bookSlot, bookingCard, dateLabel, pickDay } from "../fixtures/booking";
import { BUSINESS } from "../../../scripts/staging/personas.mjs";

// Customer books → owner sees the New request (notification + console) and accepts with a note →
// customer sees "Booking confirmed" with Add to Calendar, and the booking as Confirmed with the owner's note.
test("booking: customer books, owner accepts, customer sees the confirmation", async ({ customer, owner }, testInfo) => {
  const note = `e2e accept ${uid()}`;
  const reply = `See you ${uid()}`;
  const time = `${9 + testInfo.repeatEachIndex}:00 AM`;

  await bookSlot(customer, { target: `/business/${BUSINESS.id}`, item: "Test Haircut", dayOffset: 6, time, note });
  await expect(customer.getByText(new RegExp(`booked for ${dateLabel(6)} at ${time}`, "i"))).toBeVisible();

  // Owner: New request in the business-scoped notifications, with Accept/Decline.
  await owner.goto(`/notifications?scope=BUSINESS&id=${BUSINESS.id}`);
  const request = owner.getByRole("button", { name: new RegExp(`Test Customer One • New booking request.*${time}.*New`) }).first();
  await expect(request).toBeVisible({ timeout: 20_000 });
  await expect(request.getByRole("button", { name: "Accept" })).toBeVisible();

  // Owner: the console shows the pending booking with the customer's note; accept with a reply.
  await owner.goto(`/business/${BUSINESS.id}/manage/appointments`);
  const card = bookingCard(owner, note);
  await expect(card.getByText("Pending")).toBeVisible();
  await card.getByRole("button", { name: "Accept" }).click();
  await owner.getByPlaceholder(/See you then/).fill(reply);
  await owner.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(card.getByText("Confirmed")).toBeVisible();
  await expect(card.getByText(reply)).toBeVisible();

  // Customer: confirmation notification with the calendar action, and the booking marked Confirmed.
  await customer.goto("/notifications");
  const confirmed = customer.getByRole("button", { name: new RegExp(`Test Salon One • Booking confirmed.*${time}.*Confirmed`) }).first();
  await expect(confirmed).toBeVisible({ timeout: 20_000 });
  await expect(confirmed.getByRole("button", { name: "Add to Calendar" })).toBeVisible();

  await customer.goto("/appointments");
  const mine = customer.locator("div.card").filter({ hasText: note }).last();
  await expect(mine.getByText("Confirmed").first()).toBeVisible();
  await expect(mine.getByText(reply)).toBeVisible();

  // Persists after reload.
  await customer.reload();
  await expect(customer.locator("div.card").filter({ hasText: note }).last().getByText(reply)).toBeVisible();
});

// E2E-009: if the app can't confirm the session during Confirm Booking (a network blip on the auth check), it must
// not tell the customer "Appointment booked" for a booking the server never received.
test("booking: a network blip during confirm never reports an unsaved booking as booked", async ({ customer }, testInfo) => {
  const note = `e2e blip ${uid()}`;
  const time = `${3 + testInfo.repeatEachIndex}:00 PM`;
  await customer.goto(`/business/${BUSINESS.id}`);
  await customer.getByRole("button", { name: "Book Appointment", exact: true }).click();
  await customer.getByRole("button", { name: /^Test Haircut ₹/ }).click();
  await pickDay(customer, 3);
  await customer.getByRole("button", { name: new RegExp(`^${time}`) }).click();
  await customer.getByPlaceholder(/Describe your requirement/).fill(note);
  await customer.route("**/auth/v1/user", (r) => r.abort("internetdisconnected"));
  await customer.getByRole("button", { name: `Confirm Booking · ${time}` }).click();
  // Either the booking reached the server, or the customer is told it didn't.
  const outcome = await Promise.race([
    customer.getByText(/booked for/i).waitFor().then(() => "booked"),
    customer.getByText(/couldn.t|try again|offline|sign in/i).first().waitFor().then(() => "error"),
  ]);
  await customer.unroute("**/auth/v1/user");
  if (outcome === "booked") {
    await customer.goto("/appointments");
    await expect(customer.locator("div.card").filter({ hasText: note })).not.toHaveCount(0);
  }
});
