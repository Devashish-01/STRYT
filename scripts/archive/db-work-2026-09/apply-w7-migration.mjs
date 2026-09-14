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

const migrationName = "20260960_queue_tokens_stage3_lockdown";
const migPath = path.join(ROOT, "supabase/migrations", `${migrationName}.sql`);
const migSql = fs.readFileSync(migPath, "utf8");
const sha256 = crypto.createHash("sha256").update(migSql).digest("hex");

console.log(`Applying migration: ${migrationName}`);
console.log(`Project: ${REF}`);
console.log(`File size: ${migSql.length} bytes`);
console.log(`File sha256: ${sha256}`);

const child = spawn("npx", ["-y", "@supabase/mcp-server-supabase"], {
  env: {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: TOKEN,
  },
  shell: true,
});

let buffer = "";

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

let stage = 0;

child.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.id === 1) {
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        console.log("MCP initialized. Calling apply_migration...");
        stage = 1;
        send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "apply_migration",
            arguments: {
              project_id: REF,
              name: migrationName,
              query: migSql,
            },
          },
        });
      } else if (parsed.id === 2) {
        console.log("apply_migration response:");
        console.log(JSON.stringify(parsed, null, 2));
        if (parsed.error || parsed.result?.isError) {
          console.error("Migration failed!");
          child.kill();
          process.exit(1);
        }
        console.log("apply_migration successful! Calling notify pgrst, 'reload schema'...");
        stage = 2;
        send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "execute_sql",
            arguments: {
              project_id: REF,
              query: "notify pgrst, 'reload schema';",
            },
          },
        });
      } else if (parsed.id === 3) {
        console.log("reload schema response:");
        console.log(JSON.stringify(parsed, null, 2));
        console.log("\n=======================================================");
        console.log(`🎉 MIGRATION ${migrationName} APPLIED SUCCESSFULLY!`);
        console.log("=======================================================\n");
        child.kill();
        process.exit(0);
      }
    } catch (e) {
      // ignore non-json
    }
  }
});

child.stderr.on("data", (data) => {
  // console.error("ERR:", data.toString());
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "w7-applier", version: "1.0" },
  },
});
