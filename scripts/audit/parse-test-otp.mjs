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

async function parseSmsTestOtp() {
  const env = readEnv();
  const token = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
  const projectRef = "gnswxlfmcwyhmzlfipql";

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const rawOtp = data.sms_test_otp || "";

  // Supabase test OTP format is typically "phone1=otp1,phone2=otp2" or "phone1:otp1,phone2:otp2"
  const pairs = rawOtp.split(",").map(s => s.trim()).filter(Boolean);
  console.log("Total configured test OTP accounts:", pairs.length);

  const parsedNumbers = [];
  for (const p of pairs) {
    const [phone, _otp] = p.split(/[=:]/);
    if (phone) parsedNumbers.push(phone.trim());
  }

  console.log("Configured Phone Numbers (masked):");
  for (const phone of parsedNumbers) {
    console.log(`- ${phone.slice(0, 4)}****${phone.slice(-3)}`);
  }

  // Cross reference with DB users!
  const sql = `
    SELECT id, phone, name, alias, roles, customer_enabled
    FROM public.users
    WHERE phone IN (${parsedNumbers.map(n => `'${n.replace(/'/g, "''")}'`).join(", ")})
       OR replace(phone, '+', '') IN (${parsedNumbers.map(n => `'${n.replace(/[+]/g, "").replace(/'/g, "''")}'`).join(", ")});
  `;
  const matchedUsers = await executeSql(sql);
  console.log("\nMatched DB Users Count:", matchedUsers.length);
  for (const u of matchedUsers) {
    const maskedPhone = u.phone ? `${u.phone.slice(0, 4)}****${u.phone.slice(-3)}` : "none";
    console.log(`- ID: ${u.id}, Phone: ${maskedPhone}, Roles: ${JSON.stringify(u.roles)}, Name: ${u.name}`);
  }

  if (matchedUsers.length > 0) {
    const userIds = matchedUsers.map(u => `'${u.id}'`).join(", ");
    const bizSql = `
      SELECT b.id, b.name, b.owner_user_id
      FROM public.businesses b
      WHERE b.owner_user_id IN (${userIds});
    `;
    const matchedBiz = await executeSql(bizSql);
    console.log("\nBusinesses owned by Test OTP Users:", matchedBiz.length);
    for (const b of matchedBiz) {
      console.log(`- Biz: ${b.name}, Owner: ${b.owner_user_id}`);
    }
  }
}

parseSmsTestOtp().catch(console.error);
