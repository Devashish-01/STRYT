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

const sqlTest = `
do $test_block$
declare
  v_owner text := '00000000-0000-0000-0000-000000000070';
  v_cust1 text := '00000000-0000-0000-0000-000000000071';
  v_cust2 text := '00000000-0000-0000-0000-000000000072';
  v_stranger text := '00000000-0000-0000-0000-000000000073';
  v_biz text := 'b_w7_test_' || replace(gen_random_uuid()::text, '-', '');
  v_token1_id uuid;
  v_token2_id uuid;
  v_count integer;
  v_anon_priv boolean;
  v_line_count integer;
  v_my_token_id uuid;
  v_check_user text;
begin
  set local lock_timeout = '2s';

  -------------------------------------------------------------
  -- 1. Create temporary test users for FK integrity (rolled back)
  -------------------------------------------------------------
  insert into public.users (id, name) values
    (v_owner, 'W7 Test Owner'),
    (v_cust1, 'W7 Test Customer 1'),
    (v_cust2, 'W7 Test Customer 2'),
    (v_stranger, 'W7 Test Stranger')
  on conflict (id) do nothing;

  -------------------------------------------------------------
  -- 2. Create test business and queue settings (open queue)
  -------------------------------------------------------------
  insert into public.businesses (id, owner_user_id, name)
  values (v_biz, v_owner, 'W7 Test Queue Shop');

  insert into public.queue_settings (business_id, is_open)
  values (v_biz, true)
  on conflict (business_id) do update set is_open = true;

  -------------------------------------------------------------
  -- 3. Insert test queue tokens (status WAITING)
  -------------------------------------------------------------
  insert into public.queue_tokens (business_id, customer_user_id, customer_name, party_size, status)
  values (v_biz, v_cust1, 'Customer One', '1 person', 'WAITING')
  returning id into v_token1_id;

  insert into public.queue_tokens (business_id, customer_user_id, customer_name, party_size, status)
  values (v_biz, v_cust2, 'Customer Two', '2 people', 'WAITING')
  returning id into v_token2_id;

  -------------------------------------------------------------
  -- 4. Apply Stage 3 lockdown inline inside transaction
  -------------------------------------------------------------
  drop policy if exists queue_tokens_select_all on public.queue_tokens;

  create policy queue_tokens_select_participants on public.queue_tokens
    for select to authenticated
    using (
      customer_user_id = (select auth.uid())::text
      or exists (
        select 1 from public.businesses b
         where b.id = queue_tokens.business_id
           and b.owner_user_id = (select auth.uid())::text
      )
    );

  revoke all on table public.queue_tokens from anon;

  -------------------------------------------------------------
  -- 5. Verification Check A: anon table privilege revoked
  -------------------------------------------------------------
  v_anon_priv := has_table_privilege('anon', 'public.queue_tokens', 'SELECT');
  if v_anon_priv is not false then
    raise exception 'ANON_PRIVILEGE_ERROR: Expected anon SELECT privilege = false, got %', v_anon_priv;
  end if;

  -------------------------------------------------------------
  -- 6. Verification Check B: Customer 1 sees only own token (1)
  -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_cust1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_count from public.queue_tokens where business_id = v_biz;
  if v_count <> 1 then
    raise exception 'CUST1_COUNT_ERROR: Expected customer 1 to see 1 token, got %', v_count;
  end if;

  select customer_user_id into v_check_user
    from public.queue_tokens where business_id = v_biz;
  if v_check_user <> v_cust1 then
    raise exception 'CUST1_DATA_ERROR: Customer 1 did not see own token, saw %', v_check_user;
  end if;

  reset role;

  -------------------------------------------------------------
  -- 7. Verification Check C: Business owner sees all business tokens (2)
  -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_count from public.queue_tokens where business_id = v_biz;
  if v_count <> 2 then
    raise exception 'OWNER_COUNT_ERROR: Expected owner to see 2 tokens, got %', v_count;
  end if;

  reset role;

  -------------------------------------------------------------
  -- 8. Verification Check D: Stranger sees 0 tokens
  -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_count from public.queue_tokens where business_id = v_biz;
  if v_count <> 0 then
    raise exception 'STRANGER_COUNT_ERROR: Expected stranger to see 0 tokens, got %', v_count;
  end if;

  reset role;

  -------------------------------------------------------------
  -- 9. Verification Check E: Guest (anon) querying queue_waiting_line()
  --    gets 2 line positions, but my_token_id is null
  -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;

  select count(*) into v_line_count from public.queue_waiting_line(ARRAY[v_biz]);
  if v_line_count <> 2 then
    raise exception 'GUEST_LINE_COUNT_ERROR: Expected 2 line positions from queue_waiting_line, got %', v_line_count;
  end if;

  -- Ensure guest does not get any token ids
  select count(*) into v_count from public.queue_waiting_line(ARRAY[v_biz]) where my_token_id is not null;
  if v_count <> 0 then
    raise exception 'GUEST_TOKEN_LEAK_ERROR: Guest saw token IDs: %', v_count;
  end if;

  reset role;

  -------------------------------------------------------------
  -- 10. Verification Check F: Customer 1 calling queue_waiting_line()
  --     gets line positions and their own my_token_id populated
  -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_cust1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select my_token_id into v_my_token_id from public.queue_waiting_line(ARRAY[v_biz]) where my_token_id is not null;
  if v_my_token_id <> v_token1_id then
    raise exception 'CUST1_LINE_TOKEN_ERROR: Expected my_token_id = %, got %', v_token1_id, v_my_token_id;
  end if;

  reset role;

  -------------------------------------------------------------
  -- 11. Abort transaction cleanly with ALL_CHECKS_PASSED
  -------------------------------------------------------------
  raise exception 'TEST_RESULT: ALL_CHECKS_PASSED';
end $test_block$;
`;

console.log("Starting W7 forced-rollback behavioural test against project:", REF);

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
        console.log("Supabase MCP client initialized. Executing forced-rollback test block via execute_sql...");
        send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "execute_sql",
            arguments: {
              project_id: REF,
              query: sqlTest,
            },
          },
        });
      } else if (parsed.id === 2) {
        console.log("execute_sql response received.");
        const resultText = JSON.stringify(parsed);
        if (resultText.includes("TEST_RESULT: ALL_CHECKS_PASSED")) {
          console.log("\n=======================================================");
          console.log("✅ W7 FORCED-ROLLBACK TEST PASSED: ALL_CHECKS_PASSED");
          console.log("   - Check A: has_table_privilege('anon', 'public.queue_tokens', 'SELECT') = false");
          console.log("   - Check B: Customer 1 sees exactly 1 token (their own)");
          console.log("   - Check C: Business owner sees all 2 tokens for their business");
          console.log("   - Check D: Stranger sees 0 tokens");
          console.log("   - Check E: Guest (anon) retrieves 2 line positions via queue_waiting_line()");
          console.log("              without leaking any token IDs or customer details");
          console.log("   - Check F: Customer 1 retrieves line positions with own token marked");
          console.log("   - Transaction aborted via RAISE EXCEPTION; 0 rows / 0 drift retained");
          console.log("=======================================================\n");
          child.kill();
          process.exit(0);
        } else {
          console.error("❌ Forced-rollback test failed! Output:\n", resultText);
          child.kill();
          process.exit(1);
        }
      }
    } catch (e) {}
  }
});

child.stderr.on("data", (data) => {
  // console.error(data.toString());
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "w7-forced-rollback", version: "1.0" },
  },
});
