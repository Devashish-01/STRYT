// P07 discovery crawler (staging only): every route × the persona that should use it. Records where the app
// lands, headings, error-boundary text, page errors, console errors and failing Supabase calls, plus a screenshot.
// Output feeds the flow specs and P08. Requires the staging preview on http://localhost:5174 (npm run build:staging
// && npm run preview:staging -- --port 5174).
//
// Usage: node tests/e2e/tools/crawl-routes.mjs <out-dir> [personaKey ...]

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { PERSONAS, BUSINESS, PROVIDER } from "../../../scripts/staging/personas.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { chromium, devices } = require("@playwright/test");
const OUT = process.argv[2];
const ONLY = process.argv.slice(3);
const BASE = "http://localhost:5174";
const PROD = "gnswxlfmcwyhmzlfipql";

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.staging"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
if (!env.STAGING_REF || env.STAGING_REF === PROD || !env.VITE_SUPABASE_URL.includes(env.STAGING_REF)) { console.error("REFUSED: not staging"); process.exit(2); }

const B = `/business/${BUSINESS.id}`, P = `/provider/${PROVIDER.id}`;
const owner = PERSONAS.find((p) => p.key === "owner1");
const ROUTES = {
  guest: ["/home", "/explore", "/search", "/categories", "/category/c-beauty-salon", "/map", "/community-hub", B, P, "/legal", "/guide", "/requests", "/appointments"],
  customer1: ["/home", "/explore", "/search", "/map", "/categories", "/category/c-beauty-salon", B, P, `/u/${owner.id}`,
    "/appointments", "/queues", "/ask", "/agreements", "/explore?tab=requests", "/chats", "/notifications", "/profile", "/profile/edit",
    "/account", "/settings/notifications", "/settings/privacy", "/settings/discovery", "/settings/language", "/settings/security",
    "/settings/location", "/settings/data", "/bookmarks", "/lists", "/followers", "/my-activity", "/safety", "/safety/contacts",
    "/community-hub", "/community/activity", "/community/new", "/story/new", "/place/new", "/onboard/business", "/onboard/provider",
    "/support", "/achievements", "/delivery"],
  owner1: ["/manage", `${B}/manage`, `${B}/manage/business`, `${B}/manage/store`, `${B}/manage/catalog`, `${B}/manage/inventory`,
    `${B}/manage/portfolio`, `${B}/manage/hours`, `${B}/manage/queue`, `${B}/manage/appointments`, `${B}/manage/deliveries`,
    `${B}/manage/qna`, `${B}/manage/inbox`, `${B}/manage/requests`, `${B}/manage/profile`, `${B}/manage/edit-profile`,
    `${B}/manage/broadcast`, `${B}/manage/reviews`, `${B}/manage/payments`, `${B}/manage/bulk-deals`, `${B}/manage/verify`,
    `${B}/manage/settings`, `${B}/manage/community`, "/account/business-access", "/notifications?scope=BUSINESS&id=" + BUSINESS.id],
  staff_queue: [`${B}/manage`, `${B}/manage/queue`, `${B}/manage/appointments`, `${B}/manage/settings`, "/account/business-access"],
  staff_appointments: [`${B}/manage`, `${B}/manage/appointments`, `${B}/manage/queue`, `${B}/manage/deliveries`],
  provider1: [`${P}/manage`, `${P}/manage/profile`, `${P}/manage/edit-profile`, `${P}/manage/availability`, `${P}/manage/catalog`,
    `${P}/manage/inventory`, `${P}/manage/portfolio`, `${P}/manage/inbox`, `${P}/manage/jobs`, `${P}/manage/find-work`,
    `${P}/manage/money`, `${P}/manage/community`, `${P}/manage/verify`, `${P}/manage/settings`, `${P}/manage/reviews`],
  admin1: ["/admin", "/admin/login"],
};

for (let i = 0; i < 150; i++) {
  try { const r = await fetch(BASE); if (r.ok) break; } catch {}
  if (i === 149) { console.error("preview server not reachable on 5174"); process.exit(1); }
  await new Promise((r) => setTimeout(r, 2000));
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const [who, routes] of Object.entries(ROUTES)) {
  if (ONLY.length && !ONLY.includes(who)) continue;
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL: BASE });
  const page = await context.newPage();
  let consoleErrors = [], pageErrors = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 180)); });
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 180)));
  page.on("response", (r) => { if (r.status() >= 400 && r.url().includes(env.STAGING_REF)) failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });

  if (who !== "guest") {
    const p = PERSONAS.find((x) => x.key === who);
    await page.goto("/auth/otp");
    await page.evaluate((phone) => sessionStorage.setItem("otp_phone", phone), p.phone);
    await page.goto("/auth/otp");
    const boxes = page.locator('input[inputmode="numeric"]');
    await boxes.nth(0).fill(env.STAGING_TEST_OTP);
    await page.getByRole("button", { name: /verify & continue/i }).click();
    await page.waitForURL((u) => !/\/auth\//.test(u.pathname), { timeout: 30000 }).catch(() => {});
  }
  for (const route of routes) {
    consoleErrors = []; pageErrors = []; failed = [];
    const started = Date.now();
    let navError = null;
    try { await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45000 }); } catch (e) { navError = String(e.message).slice(0, 120); }
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const landed = new URL(page.url());
    const headings = await page.locator("h1, h2").allInnerTexts().catch(() => []);
    const body = await page.locator("body").innerText().catch(() => "");
    const errorScreen = /something went wrong|unexpected error|failed to load|couldn.t load|error loading/i.exec(body)?.[0] || null;
    const shot = `${who}__${route.replace(/[^a-z0-9]+/gi, "_").slice(0, 80)}.png`;
    await page.screenshot({ path: path.join(OUT, shot), timeout: 15000 }).catch(() => {});
    const row = {
      who, route, landed: landed.pathname + landed.search, ms: Date.now() - started, navError,
      headings: headings.map((h) => h.trim()).filter(Boolean).slice(0, 4), errorScreen,
      pageErrors: [...new Set(pageErrors)], consoleErrors: [...new Set(consoleErrors)].slice(0, 6), failed: [...new Set(failed)], shot,
    };
    results.push(row);
    const flag = row.pageErrors.length || row.failed.length || row.errorScreen || row.navError ? "⚠" : "ok";
    console.log(`${flag} ${who} ${route} -> ${row.landed} | h: ${row.headings.slice(0, 2).join(" / ").slice(0, 60)} | failed: ${row.failed.join(", ").slice(0, 120)} | pageErr: ${row.pageErrors.join(" ; ").slice(0, 100)}${row.errorScreen ? ` | screen: ${row.errorScreen}` : ""}`);
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "crawl.json"), JSON.stringify(results, null, 1));
console.log(`wrote ${results.length} rows to ${path.join(OUT, "crawl.json")}`);
