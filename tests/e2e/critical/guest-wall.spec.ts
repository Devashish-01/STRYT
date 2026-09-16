import { test, expect, signIn } from "../fixtures/staging";
import { BUSINESS, PROVIDER } from "../../../scripts/staging/personas.mjs";

const B = `/business/${BUSINESS.id}`;

// A guest can browse home, search and a shop, but every write action is replaced by the sign-in prompt. Tapping it
// goes to sign-in, and after signing in the visitor lands back on the shop they were looking at, now able to act.
test("guest wall: browse freely, write actions ask to sign in, sign-in returns to the shop", async ({ guest }) => {
  await guest.goto("/home");
  await expect(guest.getByText("Test Salon One").first()).toBeVisible();

  await guest.goto("/search");
  await guest.getByRole("searchbox").first().fill("Test Salon");
  await expect(guest.getByText("Test Salon One").first()).toBeVisible();

  await guest.goto(B);
  await expect(guest.getByRole("heading", { name: "Test Salon One" })).toBeVisible();
  await expect(guest.getByText("Test Haircut")).toBeVisible();
  // No write controls: the action area is the sign-in prompt.
  const prompt = guest.getByRole("button", { name: "Sign in to book, message or follow" });
  await expect(prompt).toBeVisible();
  for (const action of ["Book Appointment", "Follow", "Notify me", "Join queue", "Message"]) {
    await expect(guest.getByRole("button", { name: action, exact: true }), `guest must not see ${action}`).toHaveCount(0);
  }
  await expect(guest.getByRole("button", { name: "📅 Book Appointment" })).toHaveCount(0);

  // Signed-in-only screens send the guest to sign-in.
  await guest.goto("/appointments");
  await expect(guest).toHaveURL(/\/auth\/phone$/);

  // Tap the prompt on the shop → sign-in screen → sign in → back on the shop with actions available.
  await guest.goto(B);
  await prompt.click();
  await expect(guest).toHaveURL(/\/auth\/phone$/);
  await expect(guest.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
  await signIn(guest, "customer2");
  await expect(guest).toHaveURL(new RegExp(`${B}$`));
  await expect(guest.getByRole("button", { name: "Book Appointment", exact: true })).toBeVisible();
  await expect(guest.getByRole("button", { name: "Sign in to book, message or follow" })).toHaveCount(0);
});

test("guest wall: the provider page also replaces actions with the sign-in prompt", async ({ guest }) => {
  await guest.goto(`/provider/${PROVIDER.id}`);
  await expect(guest.getByText("Test Plumber One").first()).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Sign in to/ }).first()).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Book/ })).toHaveCount(0);
});
