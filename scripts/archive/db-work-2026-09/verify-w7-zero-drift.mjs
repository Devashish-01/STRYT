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
  console.error("Missing credentials");
  process.exit(1);
}

const query = `
select
  (select count(*) from public.queue_tokens where customer_name like 'Customer %') as test_tokens,
  (select count(*) from public.businesses where id like 'b_w7_test%') as test_businesses,
  (select count(*) from public.users where id like '00000000-0000-0000-0000-00000000007%') as test_users,
  (select count(*) from pg_policies where policyname = 'queue_tokens_select_all') as old_policy_count,
  (select count(*) from pg_policies where policyname = 'queue_tokens_select_participants') as new_policy_count,
  has_table_privilege('anon', 'public.queue_tokens', 'SELECT') as anon_can_select,
  (select count(*) from net.http_request_queue) as queued_pushes;
`;

const child = spawn("npx", ["-y", "@supabase/mcp-server-supabase"], {
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN },
  shell: true,
});

let buffer = "";
function send(msg) { child.stdin.write(JSON.stringify(msg) + "\n"); }

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
            arguments: { project_id: REF, query },
          },
        });
      } else if (parsed.id === 2) {
        const text = parsed?.result?.content?.[0]?.text;
        console.log("Zero drift verification result:\n", text);
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
    clientInfo: { name: "zero-drift-check", version: "1.0" },
  },
});
