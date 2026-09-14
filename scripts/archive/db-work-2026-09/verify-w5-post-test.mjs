import { spawn } from "child_process";
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
const TOKEN = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!TOKEN || !REF) {
  console.error("Missing SUPABASE_PERSONAL_ACCESS_TOKEN or VITE_SUPABASE_URL in .env");
  process.exit(1);
}

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
        send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "execute_sql",
            arguments: {
              project_id: REF,
              query: `
                select
                  (select count(*) from public.requests where id like 'r_w5_test_%') as leftover_reqs,
                  (select count(*) from public.users where id like '00000000-0000-0000-0000-00000000005%') as leftover_users,
                  (select count(*) from public.notifications where user_id like '00000000-0000-0000-0000-00000000005%') as leftover_notifs,
                  (select pg_get_triggerdef(oid) from pg_trigger where tgname = 'me_too_count_trigger') as live_trigger;
              `,
            },
          },
        });
      } else if (parsed.id === 2) {
        console.log("RESPONSE:", JSON.stringify(parsed, null, 2));
        child.kill();
        process.exit(0);
      }
    } catch (e) {}
  }
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "verify-w5", version: "1.0" },
  },
});
