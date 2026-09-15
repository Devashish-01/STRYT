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

export const test = base;
export { expect };
