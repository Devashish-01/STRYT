import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
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
const TOKEN = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!TOKEN || !REF) {
  console.error("Missing SUPABASE_PERSONAL_ACCESS_TOKEN or VITE_SUPABASE_URL in .env");
  process.exit(1);
}

const MIGRATIONS = [
  "20260897_daily_limit_advisory_lock",
  "20260935_reschedule_preserve_payment_and_package",
  "20260947_appointment_notifications_v2",
  "20260948_delivery_notifications_v2",
  "20260949_community_notifications_v2",
  "20260950_bulk_deal_notifications_v2",
  "20260951_location_notifications_v2",
  "20260952_custom_payment_notifications_v2",
  "20260953_trust_safety_notifications_v2",
  "20260954_discovery_notifications_v2",
  "20260955_proposal_notifications_v2",
  "20260956_identity_system_notifications_v2",
];

console.log(`Starting W6 sequential production apply of ${MIGRATIONS.length} migrations to project ${REF}...`);

const child = spawn("npx", ["-y", "@supabase/mcp-server-supabase"], {
  env: {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: TOKEN,
  },
  shell: true,
});

let buffer = "";
let currentReqId = 1;
const pendingCallbacks = new Map();

function send(msg, cb) {
  if (cb) {
    pendingCallbacks.set(msg.id, cb);
  }
  child.stdin.write(JSON.stringify(msg) + "\n");
}

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++currentReqId;
    send({ jsonrpc: "2.0", id, method, params }, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

child.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.id && pendingCallbacks.has(parsed.id)) {
        const cb = pendingCallbacks.get(parsed.id);
        pendingCallbacks.delete(parsed.id);
        if (parsed.error) {
          cb(new Error(JSON.stringify(parsed.error)));
        } else {
          cb(null, parsed.result);
        }
      }
    } catch (e) {}
  }
});

child.stderr.on("data", (data) => {
  // ignore
});

async function run() {
  // 1. Initialize MCP
  console.log("Initializing Supabase MCP client...");
  await new Promise((resolve, reject) => {
    send(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "w6-batch-applier", version: "1.0" },
        },
      },
      (err, res) => {
        if (err) reject(err);
        else resolve(res);
      }
    );
  });

  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  console.log("MCP initialized successfully.\n");

  const results = [];

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const name = MIGRATIONS[i];
    const filePath = path.join(ROOT, "supabase/migrations", `${name}.sql`);
    const sql = fs.readFileSync(filePath, "utf8");
    const sha256 = crypto.createHash("sha256").update(sql).digest("hex");
    const startTime = new Date().toISOString();

    console.log(`[${i + 1}/${MIGRATIONS.length}] Applying ${name}...`);
    console.log(`    File size: ${sql.length} bytes | sha256: ${sha256.slice(0, 12)}...`);

    // Call apply_migration
    const applyRes = await rpc("tools/call", {
      name: "apply_migration",
      arguments: {
        project_id: REF,
        name: name,
        query: sql,
      },
    });

    if (applyRes?.isError) {
      console.error(`❌ FAILED: ${name}`);
      console.error(JSON.stringify(applyRes, null, 2));
      throw new Error(`Migration ${name} failed!`);
    }
    const textOutput = applyRes?.content?.[0]?.text || JSON.stringify(applyRes);
    console.log(`    Response: ${textOutput.slice(0, 150)}...`);

    // Reload schema cache
    await rpc("tools/call", {
      name: "execute_sql",
      arguments: {
        project_id: REF,
        query: "notify pgrst, 'reload schema';",
      },
    });

    const endTime = new Date().toISOString();
    console.log(`    ✅ Applied and schema reloaded at ${endTime}`);

    results.push({
      step: i + 1,
      name,
      sha256,
      startTime,
      endTime,
      status: "SUCCESS",
    });
  }

  console.log("\n=======================================================");
  console.log("🎉 ALL 12 MIGRATIONS SUCCESSFULLY APPLIED TO PRODUCTION!");
  console.log("=======================================================");
  for (const r of results) {
    console.log(`${r.step}. ${r.name} (${r.sha256.slice(0, 12)}) -> ${r.status} [${r.endTime}]`);
  }
  console.log("=======================================================\n");

  child.kill();
  process.exit(0);
}

run().catch((err) => {
  console.error("\n❌ Batch apply failed:", err);
  child.kill();
  process.exit(1);
});
