// P06: prove every synthetic persona can sign in on STAGING with the test OTP, and that its profile
// loads through get_own_profile() with onboarding + terms already satisfied. Prints no tokens.
// Usage: node scripts/staging/check-persona-signin.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PERSONAS } from "./personas.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROD = "gnswxlfmcwyhmzlfipql";
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.staging"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
if (!env.STAGING_REF || env.STAGING_REF === PROD || !env.VITE_SUPABASE_URL.includes(env.STAGING_REF)) {
  console.error("REFUSED: .env.staging does not point at the staging project");
  process.exit(2);
}
// Either variable name, for the same reason as idor-sweep.mjs.
const H = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" };
console.log("auth target:", env.STAGING_REF, "(staging)");
let failures = 0;
for (const p of PERSONAS) {
  const send = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/otp`, { method: "POST", headers: H, body: JSON.stringify({ phone: p.phone }) });
  const verify = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/verify`, { method: "POST", headers: H, body: JSON.stringify({ phone: p.phone, token: env.STAGING_TEST_OTP, type: "sms" }) });
  const session = await verify.json().catch(() => ({}));
  let profile = "no session";
  if (session.access_token) {
    const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/get_own_profile`, { method: "POST", headers: { ...H, Authorization: `Bearer ${session.access_token}` }, body: "{}" });
    const body = await r.json();
    const u = Array.isArray(body) ? body[0] : body;
    profile = `profile HTTP ${r.status} roles=${u?.roles} onboarded=${!!u?.onboarding_completed_at} terms=${u?.terms_accepted_version}`;
  }
  const ok = send.ok && verify.ok && session.user?.id === p.id;
  if (!ok) failures++;
  console.log(`${p.key.padEnd(19)} otp ${send.status} verify ${verify.status} ${ok ? "session OK (id matches)" : `FAILED ${JSON.stringify(session).slice(0, 140)}`} | ${profile}`);
}
process.exit(failures ? 1 : 0);
