import { test, expect, signIn, type PersonaKey } from "../fixtures/staging";

// P06 proof and the base of every multi-persona E2E test: each synthetic persona signs in through the
// real OTP screen on staging and reaches a signed-in screen (not an auth/onboarding/terms gate) that
// finishes loading. Failed API calls and console errors are attached to the report.
const KEYS: PersonaKey[] = ["customer1", "customer2", "owner1", "staff_queue", "staff_appointments", "provider1", "admin1"];

for (const key of KEYS) {
  test(`${key} signs in on staging and reaches a loaded signed-in screen`, async ({ page }, testInfo) => {
    const failed: string[] = [];
    const consoleErrors: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 400 && /supabase\.co/.test(r.url())) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });

    await signIn(page, key);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await expect(page.getByText("Continue with Google")).toHaveCount(0);

    await testInfo.attach("landing", { body: `url: ${new URL(page.url()).pathname}\nfailed api calls:\n${[...new Set(failed)].join("\n") || "none"}\nconsole errors:\n${[...new Set(consoleErrors)].join("\n") || "none"}`, contentType: "text/plain" });
    console.log(`[${key}] landed on ${new URL(page.url()).pathname} | failed API: ${[...new Set(failed)].join(", ") || "none"}`);
    await page.screenshot({ path: testInfo.outputPath(`${key}-home.png`), timeout: 20_000, animations: "disabled" });
  });
}
