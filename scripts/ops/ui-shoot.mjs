#!/usr/bin/env node
// Screenshots app pages at phone size against the STAGING backend, so UI work can be judged by eye.
//
//   node scripts/ops/ui-shoot.mjs --out <dir> [--persona customer1] [--width 390] [--height 844] [--full] /home /explore ...
//   node scripts/ops/ui-shoot.mjs --out <dir> --guest /auth/phone /legal
//
// Signs the persona in through GoTrue's phone test-OTP (staging only: the project ref in .env.staging is checked and
// production is refused), injects the session into localStorage, starts `vite --mode staging`, shoots each route,
// stops vite. Needs Google Chrome installed (Playwright channel "chrome"). Output files: <out>/<route>.png

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PERSONAS } from "../staging/personas.mjs";

const PRODUCTION_REF = "gnswxlfmcwyhmzlfipql";
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);
const valueFlags = new Set(["--out", "--persona", "--width", "--height", "--port", "--session", "--fill", "--wait", "--click"]);
// Routes may be given without the leading slash (Git Bash on Windows rewrites "/home" into a filesystem path).
const routes = argv
  .filter((a, i) => !a.startsWith("--") && !valueFlags.has(argv[i - 1]))
  .map((a) => (a.startsWith("/") ? a : "/" + a));

const out = opt("--out");
if (!out) throw new Error("--out <dir> is required");
if (routes.length === 0) throw new Error("give at least one route, e.g. /home");
const width = Number(opt("--width", 390));
const height = Number(opt("--height", 844));
const port = Number(opt("--port", 5199));
const guest = flag("--guest");
const full = flag("--full");
const personaKey = opt("--persona", "customer1");
// --session key=value (repeatable): sessionStorage entries set before the page loads, e.g. --session otp_phone=9876543210
// --fill "css selector=text" (repeatable): fill the first matching input after load; --wait <ms>: extra settle time before the shot.
const fills = argv.flatMap((a, i) => (argv[i - 1] === "--fill" ? [a] : [])).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]);
const clicks = argv.flatMap((a, i) => (argv[i - 1] === "--click" ? [a] : []));  // --click "css selector" (repeatable), after fills
const extraWait = Number(opt("--wait", 0));
const sessionEntries = argv.flatMap((a, i) => (argv[i - 1] === "--session" ? [a] : [])).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]);

// ── staging env, with the same refusals the e2e fixtures use ─────────────────────────────────────────────────────
const env = {};
for (const line of fs.readFileSync(".env.staging", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
if (!env.STAGING_REF || env.STAGING_REF === PRODUCTION_REF) throw new Error("REFUSED: .env.staging is missing a staging ref or points at production");
if (!env.VITE_SUPABASE_URL.includes(env.STAGING_REF)) throw new Error("REFUSED: VITE_SUPABASE_URL is not the staging project");

fs.mkdirSync(out, { recursive: true });

// ── session for the persona ──────────────────────────────────────────────────────────────────────────────────────
async function personaSession() {
  const p = PERSONAS.find((x) => x.key === personaKey);
  if (!p) throw new Error(`unknown persona ${personaKey}`);
  const phone = p.phone.replace(/\s+/g, "");
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ type: "sms", phone, token: env.STAGING_TEST_OTP }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) throw new Error(`persona sign-in failed: ${JSON.stringify(body).slice(0, 200)}`);
  return { ...body, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600) };
}

// ── dev server ─────────────────────────────────────────────────────────────────────────────────────────────────────
const vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--mode", "staging", "--port", String(port), "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});
let viteLog = "";
vite.stdout.on("data", (d) => (viteLog += d));
vite.stderr.on("data", (d) => (viteLog += d));
const stopVite = () => { try { process.platform === "win32" ? spawn("taskkill", ["/pid", String(vite.pid), "/t", "/f"]) : vite.kill("SIGTERM"); } catch { /* ignore */ } };
process.on("exit", stopVite);

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://localhost:${port}/`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("vite did not start:\n" + viteLog.slice(-800));
}

try {
  const session = guest ? null : await personaSession();
  await waitForServer();

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: width < 700,
    hasTouch: width < 700,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    geolocation: { latitude: 18.5679, longitude: 73.9143 },
    permissions: ["geolocation"],
  });
  if (session) {
    const key = `sb-${env.STAGING_REF}-auth-token`;
    await context.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, [key, JSON.stringify(session)]);
  }
  if (sessionEntries.length) {
    await context.addInitScript((entries) => { try { for (const [k, v] of entries) sessionStorage.setItem(k, v); } catch { /* ignore */ } }, sessionEntries);
  }
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 110)}`); });
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`); });

  for (const route of routes) {
    problems.length = 0;
    await page.goto(`http://localhost:${port}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    for (const [sel, val] of fills) await page.locator(sel).first().fill(val).catch((e) => console.log(`   fill ${sel} failed: ${e.message.slice(0, 80)}`));
    for (const sel of clicks) await page.locator(sel).first().click().catch((e) => console.log(`   click ${sel} failed: ${e.message.slice(0, 80)}`));
    if (fills.length || clicks.length || extraWait) await page.waitForTimeout(extraWait || 1200);
    const file = path.join(out, (route === "/" ? "root" : route.replace(/^\//, "").replace(/[\/?=&]+/g, "_")) + ".png");
    await page.screenshot({ path: file, fullPage: full });
    console.log(`${route}  ->  ${file}  (final url ${new URL(page.url()).pathname}${problems.length ? `, ${problems.length} console problem(s)` : ""})`);
    for (const p of problems.slice(0, 3)) console.log("   ", p);
  }
  await browser.close();
} finally {
  stopVite();
}
