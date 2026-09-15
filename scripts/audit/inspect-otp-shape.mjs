import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

async function inspectOtpShape() {
  const env = readEnv();
  const token = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
  const projectRef = "gnswxlfmcwyhmzlfipql";

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const otp = data.sms_test_otp;
  console.log("Type of sms_test_otp:", typeof otp, Array.isArray(otp) ? "array" : "object");
  if (Array.isArray(otp)) {
    console.log("Array length:", otp.length);
    console.log("Sample item shapes (sanitized):", otp.slice(0, 3).map(x => typeof x));
  } else if (otp && typeof otp === "object") {
    const keys = Object.keys(otp);
    console.log("Object key count:", keys.length);
    console.log("Sample keys (first 5):", keys.slice(0, 5));
    // If it's a string, maybe it's comma-separated or JSON string?
  } else if (typeof otp === "string") {
    console.log("String length:", otp.length);
  }
}

inspectOtpShape().catch(console.error);
