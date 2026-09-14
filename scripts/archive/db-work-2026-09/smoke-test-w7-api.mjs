import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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

const env = readEnv();
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

async function run() {
  console.log("Running guest API smoke tests against:", URL);

  // 1. Direct query on queue_tokens as anon
  const resTable = await fetch(`${URL}/rest/v1/queue_tokens?select=id,customer_name`, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
  });

  console.log(`1. GET /rest/v1/queue_tokens as anon -> Status: ${resTable.status}`);
  const textTable = await resTable.text();
  console.log(`   Response: ${textTable}`);

  if (resTable.status === 401 || resTable.status === 403 || textTable.includes("42501") || textTable.includes("permission denied")) {
    console.log("   ✅ Table access successfully denied for anon!");
  } else {
    console.error("   ❌ UNEXPECTED: anon was able to access queue_tokens or got unexpected status!");
    process.exit(1);
  }

  // 2. Call queue_waiting_line RPC as anon
  const resRpc = await fetch(`${URL}/rest/v1/rpc/queue_waiting_line`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_business_ids: ["b_nonexistent"] }),
  });

  console.log(`2. POST /rest/v1/rpc/queue_waiting_line as anon -> Status: ${resRpc.status}`);
  const jsonRpc = await resRpc.json();
  console.log(`   Response:`, jsonRpc);

  if (resRpc.ok && Array.isArray(jsonRpc)) {
    console.log("   ✅ queue_waiting_line RPC works properly for guests!");
  } else {
    console.error("   ❌ UNEXPECTED: queue_waiting_line RPC failed for anon!");
    process.exit(1);
  }

  console.log("\nAll API smoke tests passed!");
}

run().catch((err) => {
  console.error("API smoke test failed:", err);
  process.exit(1);
});
