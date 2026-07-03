import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env");

let token = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;

if (!token && existsSync(envPath)) {
  try {
    const envContent = readFileSync(envPath, "utf8");
    const matches = envContent.match(/^\s*SUPABASE_PERSONAL_ACCESS_TOKEN\s*=\s*(.+)$/m);
    if (matches) {
      token = matches[1].replace(/^["']|["']$/g, "").trim();
    }
  } catch (err) {
    console.error("Error reading .env file:", err);
  }
}

if (!token) {
  console.error("Error: SUPABASE_PERSONAL_ACCESS_TOKEN not found in environment or .env file.");
  process.exit(1);
}

// Spawn official Supabase MCP server, passing the token via the expected env key.
// stdin and stdout are piped natively so JSON-RPC flows transparently to Claude Code.
const child = spawn("npx", ["-y", "@supabase/mcp-server-supabase"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: token,
  },
  shell: true,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
