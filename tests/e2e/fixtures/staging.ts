import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page, type Browser } from "@playwright/test";
import { PERSONAS } from "../../../scripts/staging/personas.mjs";

export const PRODUCTION_REF = "gnswxlfmcwyhmzlfipql";

export type StagingEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  STAGING_REF: string;
  STAGING_TEST_OTP: string;
};

/** Reads .env.staging and refuses anything that isn't the staging project. */
export function loadStagingEnv(root = process.cwd()): StagingEnv {
  const file = path.join(root, ".env.staging");
  if (!fs.existsSync(file)) throw new Error("REFUSED: .env.staging is missing — run node scripts/staging/setup-staging-auth.mjs");
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  const e = env as StagingEnv;
  if (!e.STAGING_REF || e.STAGING_REF === PRODUCTION_REF) throw new Error("REFUSED: STAGING_REF is missing or is production");
  if (!e.VITE_SUPABASE_URL?.includes(e.STAGING_REF) || e.VITE_SUPABASE_URL.includes(PRODUCTION_REF)) {
    throw new Error("REFUSED: VITE_SUPABASE_URL in .env.staging is not the staging project");
  }
  if (!/^\d{6}$/.test(e.STAGING_TEST_OTP ?? "")) throw new Error("REFUSED: STAGING_TEST_OTP missing");
  return e;
}

export type PersonaKey = "customer1" | "customer2" | "owner1" | "staff_queue" | "staff_appointments" | "provider1" | "admin1";

export function persona(key: PersonaKey) {
  const p = PERSONAS.find((x: { key: string }) => x.key === key);
  if (!p) throw new Error(`unknown persona ${key}`);
  return p as { key: PersonaKey; id: string; phone: string; name: string; alias: string; roles: string[] };
}

/**
 * Signs a persona in through the app's real OTP screen (/auth/otp): the phone is handed over the same way
 * the app does it (sessionStorage "otp_phone"), the 6-digit staging test code is typed, and the app
 * navigates away once Supabase returns a session.
 */
export async function signIn(page: Page, key: PersonaKey) {
  const env = loadStagingEnv();
  const p = persona(key);
  await page.goto("/auth/otp?e2e=1");
  // The screen reads the phone from sessionStorage when there is no router state; set it and reload.
  await page.evaluate((phone) => sessionStorage.setItem("otp_phone", phone), p.phone);
  await page.goto("/auth/otp");
  const boxes = page.locator('input[inputmode="numeric"]');
  await expect(boxes).toHaveCount(6);
  // Put the whole code into the first box, like SMS autofill / paste (the screen spreads it over all six).
  // Filling box by box faster than React re-renders can drop a digit.
  await boxes.nth(0).fill(env.STAGING_TEST_OTP);
  for (let i = 0; i < 6; i++) await expect(boxes.nth(i)).toHaveValue(env.STAGING_TEST_OTP[i]);
  await page.getByRole("button", { name: /verify & continue/i }).click();
  await expect(page).not.toHaveURL(/\/auth\/(otp|phone|onboard|terms)/, { timeout: 30_000 });
}

/** A fresh browser context signed in as the persona (each actor gets its own storage). */
export async function personaPage(browser: Browser, key: PersonaKey, contextOptions = {}) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await signIn(page, key);
  return { context, page };
}

type Personas = {
  guest: Page;
  customer: Page;
  customer2: Page;
  owner: Page;
  staffQueue: Page;
  staffAppointments: Page;
  provider: Page;
  admin: Page;
};

/**
 * Each persona signs in once per worker through the OTP screen; its storage state is saved to
 * .auth/staging-<persona>.json and reused by every test's fresh context. Sessions older than 40 minutes are
 * signed in again, so no context ever loads an expired access token and rotates a refresh token another
 * context still holds.
 */
const SESSION_MAX_AGE_MS = 40 * 60 * 1000;
const signedInAt = new Map<PersonaKey, number>();
// A reseed deletes and recreates the auth users, which invalidates every saved session.
const RESEED_MARKER = path.join(process.cwd(), ".auth", "staging-seeded-at");

export async function stateFor(browser: Browser, key: PersonaKey) {
  const file = path.join(process.cwd(), ".auth", `staging-${key}.json`);
  // Reuse a saved session across runs while it is fresh and newer than the last reseed (fewer OTP sign-ins, which
  // staging auth rate-limits).
  const savedAt = fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0;
  const seededAt = fs.existsSync(RESEED_MARKER) ? fs.statSync(RESEED_MARKER).mtimeMs : 0;
  const at = signedInAt.get(key) ?? (savedAt > seededAt ? savedAt : undefined);
  if (!at || Date.now() - at > SESSION_MAX_AGE_MS || !fs.existsSync(file)) {
    // The runner applies the project's `use` options (device, baseURL) to browser.newContext.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await signIn(page, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await context.storageState({ path: file });
    await context.close();
    signedInAt.set(key, Date.now());
  }
  return file;
}

/** A fresh browser context for the persona (guest = no session). */
export async function openAs(browser: Browser, key: PersonaKey | "guest") {
  const storageState = key === "guest" ? { cookies: [], origins: [] } : await stateFor(browser, key);
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  return { context, page };
}

function personaFixture(key: PersonaKey | "guest") {
  return async ({ browser }: { browser: Browser }, use: (p: Page) => Promise<void>) => {
    const { context, page } = await openAs(browser, key);
    await use(page);
    await context.close();
  };
}

export const test = base.extend<Personas>({
  guest: personaFixture("guest"),
  customer: personaFixture("customer1"),
  customer2: personaFixture("customer2"),
  owner: personaFixture("owner1"),
  staffQueue: personaFixture("staff_queue"),
  staffAppointments: personaFixture("staff_appointments"),
  provider: personaFixture("provider1"),
  admin: personaFixture("admin1"),
});
export { expect };

/**
 * Marks a test blocked by a known, logged bug (docs/gaps/GAP_LEDGER.csv). It is reported as fixme and skipped;
 * E2E_RUN_FIXME=1 runs these tests anyway, to prove a bug still reproduces or that a fix closed it.
 */
export const knownBug = (reason: string) => test.fixme(process.env.E2E_RUN_FIXME !== "1", reason);

/**
 * Cross-person propagation: reloads `page` until `locator()` is visible. Another persona's action (often applied
 * optimistically on their screen first) reaches this persona's screen only after the server write lands.
 */
export async function expectAfterReload(
  page: Page,
  locator: () => ReturnType<Page["locator"]> | Promise<ReturnType<Page["locator"]>>,
  timeout = 30_000,
) {
  await expect
    .poll(
      async () => {
        await page.reload();
        await expect(page.locator(".skel")).toHaveCount(0, { timeout: 15_000 }).catch(() => {});
        const target = await Promise.resolve(locator()).catch(() => null);
        if (!target) return false;
        return target.first().isVisible({ timeout: 3_000 }).catch(() => false);
      },
      { timeout, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
}

/** A short unique suffix so every test creates its own records. */
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
