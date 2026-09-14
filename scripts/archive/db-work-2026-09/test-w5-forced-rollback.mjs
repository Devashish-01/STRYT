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

const mig50Raw = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260950_bulk_deal_notifications_v2.sql"), "utf8");

// Extract sync_request_me_too function definition from 20260950
const fnMatch = mig50Raw.match(/create or replace function public\.sync_request_me_too\(\)[\s\S]*?end;\s*\$\$;/i);
if (!fnMatch) {
  console.error("Could not extract sync_request_me_too from 20260950!");
  process.exit(1);
}

const fnSql = fnMatch[0].replace(/\$\$/g, "$fn_me_too$");

const sqlTest = `
do $test_block$
declare
  v_owner text := '00000000-0000-0000-0000-000000000050';
  v_n1 text := '00000000-0000-0000-0000-000000000051';
  v_n2 text := '00000000-0000-0000-0000-000000000052';
  v_n3 text := '00000000-0000-0000-0000-000000000053';
  v_req_id text := 'r_w5_test_' || replace(gen_random_uuid()::text, '-', '');
  v_count integer;
  v_notif_count integer;
  v_unlocked_count integer;
begin
  set local lock_timeout = '2s';

  -------------------------------------------------------------
  -- 1. Create temporary test users for FK integrity (rolled back)
  -------------------------------------------------------------
  insert into public.users (id, name) values
    (v_owner, 'W5 Test Requester'),
    (v_n1, 'W5 Neighbor 1'),
    (v_n2, 'W5 Neighbor 2'),
    (v_n3, 'W5 Neighbor 3')
  on conflict (id) do nothing;

  -------------------------------------------------------------
  -- 2. Create test group buy request
  -------------------------------------------------------------
  insert into public.requests (
    id, requester_user_id, title, is_group_buy, group_buy_target, me_too_count, status
  ) values (
    v_req_id, v_owner, 'W5 Test Organic Honey 1kg', true, 3, 0, 'OPEN'
  );

  -------------------------------------------------------------
  -- 3. Install proposed sync_request_me_too and replace trigger
  -------------------------------------------------------------
  execute $exec_fn$
${fnSql}
  $exec_fn$;

  drop trigger if exists me_too_count_trigger on public.request_me_toos;
  create trigger me_too_count_trigger
    after insert or delete on public.request_me_toos
    for each row execute function public.sync_request_me_too();

  -------------------------------------------------------------
  -- 4. Test 1st Me-Too: Increment count by +1 and notify owner
  -------------------------------------------------------------
  insert into public.request_me_toos (request_id, user_id, quantity)
  values (v_req_id, v_n1, 1);

  select me_too_count into v_count from public.requests where id = v_req_id;
  if v_count <> 1 then
    raise exception 'COUNT_ERROR_1: Expected me_too_count = 1, got %', v_count;
  end if;

  select count(*) into v_notif_count from public.notifications
   where user_id = v_owner and type = 'ME_TOO' and deep_link = '/request/' || v_req_id;
  if v_notif_count <> 1 then
    raise exception 'NOTIF_ERROR_1: Expected 1 ME_TOO notification for owner, got %', v_notif_count;
  end if;

  -------------------------------------------------------------
  -- 5. Test 2nd Me-Too: Increment count to 2
  -------------------------------------------------------------
  insert into public.request_me_toos (request_id, user_id, quantity)
  values (v_req_id, v_n2, 1);

  select me_too_count into v_count from public.requests where id = v_req_id;
  if v_count <> 2 then
    raise exception 'COUNT_ERROR_2: Expected me_too_count = 2, got %', v_count;
  end if;

  select count(*) into v_notif_count from public.notifications
   where user_id = v_owner and type = 'ME_TOO' and deep_link = '/request/' || v_req_id;
  if v_notif_count <> 2 then
    raise exception 'NOTIF_ERROR_2: Expected 2 ME_TOO notifications for owner, got %', v_notif_count;
  end if;

  -------------------------------------------------------------
  -- 6. Test 3rd Me-Too (Target 3 Reached! Group Buy Unlocked)
  -------------------------------------------------------------
  insert into public.request_me_toos (request_id, user_id, quantity)
  values (v_req_id, v_n3, 1);

  select me_too_count into v_count from public.requests where id = v_req_id;
  if v_count <> 3 then
    raise exception 'COUNT_ERROR_3: Expected me_too_count = 3, got %', v_count;
  end if;

  -- Owner should receive GROUP_BUY_UNLOCKED
  select count(*) into v_unlocked_count from public.notifications
   where user_id = v_owner and type = 'GROUP_BUY_UNLOCKED' and deep_link = '/request/' || v_req_id;
  if v_unlocked_count <> 1 then
    raise exception 'UNLOCKED_ERROR_OWNER: Expected 1 GROUP_BUY_UNLOCKED for owner, got %', v_unlocked_count;
  end if;

  -- All participating neighbors (v_n1, v_n2, v_n3) should receive GROUP_BUY_UNLOCKED
  select count(*) into v_unlocked_count from public.notifications
   where user_id in (v_n1, v_n2, v_n3) and type = 'GROUP_BUY_UNLOCKED' and deep_link = '/request/' || v_req_id;
  if v_unlocked_count <> 3 then
    raise exception 'UNLOCKED_ERROR_PARTICIPANTS: Expected 3 GROUP_BUY_UNLOCKED for participants, got %', v_unlocked_count;
  end if;

  -------------------------------------------------------------
  -- 7. Test Delete: Decrement count by -1
  -------------------------------------------------------------
  delete from public.request_me_toos where request_id = v_req_id and user_id = v_n1;

  select me_too_count into v_count from public.requests where id = v_req_id;
  if v_count <> 2 then
    raise exception 'COUNT_ERROR_DELETE: Expected me_too_count = 2 after deletion, got %', v_count;
  end if;

  -------------------------------------------------------------
  -- 8. FORCED ROLLBACK: Abort transaction and leave zero trace
  -------------------------------------------------------------
  raise exception 'TEST_RESULT: ALL_CHECKS_PASSED';
end $test_block$;
`;

console.log("Executing W5 Forced-Rollback Behavioural Test via Supabase MCP...");

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
        console.log("MCP initialized. Calling execute_sql with forced-rollback test block...");
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
          console.log("✅ FORCED-ROLLBACK TEST PASSED: ALL_CHECKS_PASSED");
          console.log("   - 1st 'Me Too': count accurately incremented to 1 (no double-counting)");
          console.log("   - ME_TOO notification delivered to request owner");
          console.log("   - 2nd 'Me Too': count accurately incremented to 2");
          console.log("   - 3rd 'Me Too': count reached target 3 (group buy unlocked)");
          console.log("   - GROUP_BUY_UNLOCKED notification delivered to request owner");
          console.log("   - GROUP_BUY_UNLOCKED notification delivered to all 3 participants");
          console.log("   - Delete 'Me Too': count accurately decremented to 2");
          console.log("   - Transaction fully aborted; 0 rows / 0 drift left in DB");
          console.log("=======================================================\n");
          child.kill();
          process.exit(0);
        } else {
          console.error("Test did not pass as expected! Output:", resultText);
          child.kill();
          process.exit(1);
        }
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
    clientInfo: { name: "w5-test", version: "1.0" },
  },
});
