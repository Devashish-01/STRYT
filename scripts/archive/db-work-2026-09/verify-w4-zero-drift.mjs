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

const sql = `
select
  (select count(*) from public.users where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000009')) as test_users,
  (select count(*) from public.appointments where target_id like 'w4_test_target_%') as test_appts,
  (select count(*) from public.businesses where id like 'w4_test_target_%') as test_biz,
  (select md5(btrim(regexp_replace(prosrc, '[ \\t\\r\\n\\f\\v]+', ' ', 'g'), ' ')) from pg_proc where proname = 'reschedule_appointment') as reschedule_md5,
  (select md5(btrim(regexp_replace(prosrc, '[ \\t\\r\\n\\f\\v]+', ' ', 'g'), ' ')) from pg_proc where proname = 'enforce_customer_daily_appointment_limit') as limit_md5;
`;

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
              query: sql,
            },
          },
        });
      } else if (parsed.id === 2) {
        console.log("DB State verification output:");
        console.log(JSON.stringify(parsed.result, null, 2));
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
    clientInfo: { name: "w4-verify", version: "1.0" },
  },
});
