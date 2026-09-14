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
        send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      } else if (parsed.id === 2) {
        console.log("EXECUTE_SQL:", JSON.stringify(parsed.result.tools.find(t => t.name === 'execute_sql'), null, 2));
        console.log("GET_ADVISORS:", JSON.stringify(parsed.result.tools.find(t => t.name === 'get_advisors'), null, 2));
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
    clientInfo: { name: "test-client", version: "1.0" },
  },
});
