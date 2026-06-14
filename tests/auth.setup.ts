import { test as setup, chromium, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

// Where the logged-in session is cached so the audit can reuse it.
export const SESSION_FILE = path.join(".auth", "session.json");
const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:5173";

// This is a one-time interactive step. The very first time you run `npm run audit`
// a real browser window opens. Log in with your phone + OTP like a normal user.
// As soon as you reach the app, the session is saved and reused on every future
// run (so the browser will NOT pop up again). Delete .auth/session.json or run
// `npm run audit:login` to log in again (e.g. as a different user).
setup("authenticate", async () => {
  // Reuse an existing session if we already have one.
  if (fs.existsSync(SESSION_FILE) && process.env.AUDIT_FORCE_LOGIN !== "1") {
    return;
  }

  setup.setTimeout(10 * 60 * 1000); // up to 10 minutes for you to log in

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });

  console.log(
    "\n=== LOGIN REQUIRED (one time) ===\n" +
      "A browser window opened. Log in with your phone number + OTP.\n" +
      "Once you land on the Home screen, this saves your session automatically.\n"
  );

  // Wait until the app has stored its auth token (set on successful login).
  await page.waitForFunction(() => !!localStorage.getItem("naya_access"), undefined, {
    timeout: 10 * 60 * 1000,
  });

  // Give Supabase a moment to persist its own session keys to localStorage too.
  await page.waitForTimeout(2000);

  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  await context.storageState({ path: SESSION_FILE });

  // Sanity check the token actually got captured.
  const saved = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  const hasToken = JSON.stringify(saved).includes("naya_access");
  expect(hasToken, "Login session was not captured — try again.").toBeTruthy();

  console.log("Session saved to " + SESSION_FILE + ". Continuing with the audit...\n");

  await browser.close();
});
