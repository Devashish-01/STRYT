import { test, expect, loadStagingEnv } from "../fixtures/staging";
import { stagingQuery, hasDb } from "../fixtures/db";
import { NEWCOMER_PHONES } from "../../../scripts/staging/personas.mjs";

// A person with no account signs in with a phone number → accepts the terms (18+, Terms, Privacy) → the onboarding
// beats (street, interests) → lands on Home. Signing in again skips terms and onboarding, and the acceptance is stored
// on the account. Production sign-in is Google; on staging the app's phone OTP path stands in for it.
test("customer onboarding: new phone → OTP → terms → onboarding → home", async ({ browser }) => {
  test.skip(!hasDb(), "needs the staging DB helper token to pick an unused number");
  const env = loadStagingEnv();

  // First newcomer number without an account (a reseed deletes every staging auth user).
  const taken = new Set(
    (await stagingQuery<{ phone: string }>(`select phone from auth.users where phone is not null`)).map((r) => `+${r.phone.replace(/^\+/, "")}`),
  );
  const phone = NEWCOMER_PHONES.find((p: string) => !taken.has(p));
  test.skip(!phone, "every newcomer number already has an account — reseed staging");

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 18.5362, longitude: 73.8939 });
  const page = await context.newPage();

  // "Send code" — the step the phone sign-in screen performs before showing the code boxes.
  const sent = await page.request.post(`${env.VITE_SUPABASE_URL}/auth/v1/otp`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    data: { phone },
  });
  expect(sent.status(), "send OTP").toBe(200);

  await page.goto("/auth/otp");
  await page.evaluate((p) => sessionStorage.setItem("otp_phone", p), phone!);
  await page.goto("/auth/otp");
  await page.locator('input[inputmode="numeric"]').first().fill(env.STAGING_TEST_OTP);
  await page.getByRole("button", { name: /verify & continue/i }).click();

  // Terms: can't continue until the box is ticked.
  await expect(page).toHaveURL(/\/auth\/terms$/);
  await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
  const agree = page.getByRole("button", { name: "Agree & continue" });
  await expect(agree).toBeDisabled();
  await page.getByRole("checkbox").check();
  await agree.click();

  // Onboarding beats.
  await expect(page).toHaveURL(/\/auth\/onboard$/);
  await expect(page.getByRole("heading", { name: "Where's your street?" })).toBeVisible();
  await page.getByRole("button", { name: "Use my location" }).click();
  // The location resolves to an area and shows how much is nearby before moving on.
  await expect(page.getByText(/\d+ places? near /)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What brings you here?" })).toBeVisible();
  await page.getByRole("button", { name: "🍔 Food & Beverage" }).click();
  await page.getByRole("button", { name: "Light up my street" }).click();

  // Home, with nearby places.
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Test Salon One").first()).toBeVisible();

  // Stored on the account: terms version and onboarding completion; a reload stays on Home.
  const [row] = await stagingQuery<{ terms: string | null; onboarded: string | null }>(
    `select u.terms_accepted_version as terms, u.onboarding_completed_at::text as onboarded
       from public.users u join auth.users a on a.id::text = u.id where a.phone = '${phone!.replace("+", "")}'`,
  );
  expect(row?.terms, "terms version stored").toBeTruthy();
  expect(row?.onboarded, "onboarding completed stored").toBeTruthy();
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  await context.close();
});
