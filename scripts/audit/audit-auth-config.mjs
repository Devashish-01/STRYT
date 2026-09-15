import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { executeSql } from "../../scratch/query_db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");

function readEnv() {
  const env = {};
  for (const f of [".env", ".env.local"]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

async function auditAuthConfig() {
  const env = readEnv();
  const token = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
  const projectRef = "gnswxlfmcwyhmzlfipql";

  if (!token) {
    throw new Error("SUPABASE_PERSONAL_ACCESS_TOKEN not found in environment");
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Management API error (${res.status}): ${await res.text()}`);
  }

  const authConfig = await res.json();

  // Print sanitized summary (never print passwords or secret tokens)
  console.log("=== SUPABASE AUTH CONFIGURATION ===");
  console.log("Site URL:", authConfig.site_url);
  console.log("Disable Signup:", authConfig.disable_signup);
  console.log("Email Confirmations Required:", authConfig.mailer_autoconfirm === false);
  console.log("SMS Provider:", authConfig.sms_provider);
  console.log("SMS Autoconfirm:", authConfig.sms_autoconfirm);
  console.log("JWT Expiry (seconds):", authConfig.jwt_exp);
  console.log("MFA Enabled:", authConfig.mfa_enabled);

  // Check test OTP
  const testOtpNumbers = Object.keys(authConfig.sms_test_otp || {});
  console.log("Test OTP Numbers configured (count):", testOtpNumbers.length);
  // Mask numbers for logging: e.g. +91 99999 99999 -> +91 **** **9999
  const maskedNumbers = testOtpNumbers.map(n => n.slice(0, 3) + "******" + n.slice(-4));
  console.log("Masked Test OTP Numbers:", maskedNumbers);

  // Check in database what users have these phone numbers!
  if (testOtpNumbers.length > 0) {
    const sql = `
      SELECT id, phone, name, alias, roles, customer_enabled
      FROM public.users
      WHERE phone IN (${testOtpNumbers.map(n => `'${n.replace(/'/g, "''")}'`).join(", ")});
    `;
    const users = await executeSql(sql);
    console.log("\n=== TEST OTP USERS IN DB ===");
    for (const u of users) {
      const maskedPhone = u.phone ? u.phone.slice(0, 3) + "******" + u.phone.slice(-4) : "none";
      console.log(`User ID: ${u.id}, Phone: ${maskedPhone}, Roles: ${JSON.stringify(u.roles)}, Name: ${u.name}`);
    }

    const bizSql = `
      SELECT b.id, b.name, b.owner_user_id
      FROM public.businesses b
      JOIN public.users u ON u.id = b.owner_user_id
      WHERE u.phone IN (${testOtpNumbers.map(n => `'${n.replace(/'/g, "''")}'`).join(", ")});
    `;
    const bizs = await executeSql(bizSql);
    console.log("\n=== BUSINESSES OWNED BY TEST OTP USERS ===");
    console.log(`Count: ${bizs.length}`);
    for (const b of bizs) {
      console.log(`Business: ${b.name} (ID: ${b.id}, Owner: ${b.owner_user_id})`);
    }
  }
}

auditAuthConfig().catch(console.error);
