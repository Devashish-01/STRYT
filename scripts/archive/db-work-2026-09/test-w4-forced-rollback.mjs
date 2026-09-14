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

const mig35Raw = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260935_reschedule_preserve_payment_and_package.sql"), "utf8");
const mig97Raw = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260897_daily_limit_advisory_lock.sql"), "utf8");

// Extract just the CREATE OR REPLACE FUNCTION statement and replace inner $$ with $fn$
const fn97Match = mig97Raw.match(/create or replace function public\.enforce_customer_daily_appointment_limit\(\)[\s\S]*?end \$\$;/i);
const fn35Match = mig35Raw.match(/create or replace function public\.reschedule_appointment\([\s\S]*?end\s*\$\$;/i);

if (!fn97Match || !fn35Match) {
  console.error("Could not extract function bodies from migration files!");
  process.exit(1);
}

const fn97Sql = fn97Match[0].replace(/\$\$/g, "$fn97$");
const fn35Sql = fn35Match[0].replace(/\$\$/g, "$fn35$");

const sqlTest = `
do $test_block$
declare
  v_cust_id text := '00000000-0000-0000-0000-000000000001';
  v_other_cust_id text := '00000000-0000-0000-0000-000000000002';
  v_target_owner text := '00000000-0000-0000-0000-000000000009';
  v_target_id text := 'w4_test_target_' || replace(gen_random_uuid()::text, '-', '');
  v_base_time timestamptz := date_trunc('day', now() + interval '30 days') + interval '9 hours';
  v_orig_appt public.appointments%rowtype;
  v_rescheduled public.appointments%rowtype;
  v_orig_check public.appointments%rowtype;
  v_walkin_id text;
  v_long_appt public.appointments%rowtype;
  v_item_count integer;
  i integer;
begin
  set local lock_timeout = '2s';

  -------------------------------------------------------------
  -- 1. Create temporary test users & business for FK integrity (rolled back)
  -------------------------------------------------------------
  insert into public.users (id, name) values
    (v_cust_id, 'Test Customer 1'),
    (v_other_cust_id, 'Test Customer 2'),
    (v_target_owner, 'Test Business Owner')
  on conflict (id) do nothing;

  insert into public.businesses (id, owner_user_id, name, default_slot_capacity)
  values (v_target_id, v_target_owner, 'Test Salon W4', 5)
  on conflict (id) do nothing;

  -------------------------------------------------------------
  -- 2. Install proposed function definitions in transaction
  -------------------------------------------------------------
  execute $exec97$
${fn97Sql}
  $exec97$;

  execute $exec35$
${fn35Sql}
  $exec35$;

  -------------------------------------------------------------
  -- 3. Test 20260897: 5-Cap Daily Limit & Advisory Lock
  -------------------------------------------------------------
  -- Insert 5 appointments for v_cust_id on the same day -> all succeed
  for i in 1..5 loop
    insert into public.appointments (
      target_type, target_id, target_owner_user_id, customer_user_id,
      scheduled_for, status
    ) values (
      'BUSINESS', v_target_id, v_target_owner, v_cust_id,
      v_base_time + (i || ' hours')::interval, 'PENDING'
    );
  end loop;

  -- 6th appointment for same customer on same day MUST raise 5-limit error
  begin
    insert into public.appointments (
      target_type, target_id, target_owner_user_id, customer_user_id,
      scheduled_for, status
    ) values (
      'BUSINESS', v_target_id, v_target_owner, v_cust_id,
      v_base_time + interval '6 hours', 'PENDING'
    );
    raise exception 'DAILY_LIMIT_FAIL: 6th booking was not rejected';
  exception when others then
    if sqlerrm not like '%reached the limit of 5 appointments%' then
      raise exception 'DAILY_LIMIT_FAIL: unexpected error: %', sqlerrm;
    end if;
  end;

  -- Another customer on the same day can still book (different slot, e.g., hour 7)
  insert into public.appointments (
    target_type, target_id, target_owner_user_id, customer_user_id,
    scheduled_for, status
  ) values (
    'BUSINESS', v_target_id, v_target_owner, v_other_cust_id,
    v_base_time + interval '7 hours', 'PENDING'
  );

  -------------------------------------------------------------
  -- 4. Test 20260935: Reschedule Preserves Payment Details & Package
  -------------------------------------------------------------
  -- Clean existing test rows for v_cust_id by setting to CANCELLED
  update public.appointments set status = 'CANCELLED' where customer_user_id = v_cust_id;

  -- Create a PAID booking with package & party size 2
  insert into public.appointments (
    target_type, target_id, target_owner_user_id, customer_user_id,
    scheduled_for, date_label, time_label, notes,
    package_id, package_name, package_price, party_size,
    payment_status, payment_method, payment_amount, payment_reference, status
  ) values (
    'BUSINESS', v_target_id, v_target_owner, v_cust_id,
    v_base_time + interval '2 hours', 'Day 30', '11:00 AM', 'Initial test note',
    'pkg_w4_deluxe', 'W4 Deluxe Package', 1250.00, 2,
    'PAID', 'UPI', 1250.00, 'UPI_REF_W4_TEST', 'ACCEPTED'
  ) returning * into v_orig_appt;

  -- Add line item
  insert into public.appointment_items (
    appointment_id, catalog_item_id, item_name, unit_price, quantity
  ) values (
    v_orig_appt.id, 'item_w4_1', 'Item 1', 1250.00, 1
  );

  -- Set auth context to v_cust_id
  perform set_config('request.jwt.claims', json_build_object('sub', v_cust_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Reschedule without passing payment or package overrides
  v_rescheduled := public.reschedule_appointment(
    v_orig_appt.id,
    v_base_time + interval '3 hours',
    'Day 30',
    '12:00 PM',
    'Updated reschedule note'
  );

  reset role;

  -- Verify payment details were preserved
  if v_rescheduled.payment_status <> 'PAID' then
    raise exception 'RESCHEDULE_FAIL: payment_status expected PAID, got %', v_rescheduled.payment_status;
  end if;
  if v_rescheduled.payment_method <> 'UPI' then
    raise exception 'RESCHEDULE_FAIL: payment_method expected UPI, got %', v_rescheduled.payment_method;
  end if;
  if v_rescheduled.payment_amount <> 1250.00 then
    raise exception 'RESCHEDULE_FAIL: payment_amount expected 1250.00, got %', v_rescheduled.payment_amount;
  end if;
  if v_rescheduled.payment_reference <> 'UPI_REF_W4_TEST' then
    raise exception 'RESCHEDULE_FAIL: payment_reference expected UPI_REF_W4_TEST, got %', v_rescheduled.payment_reference;
  end if;

  -- Verify package details were preserved
  if v_rescheduled.package_id <> 'pkg_w4_deluxe' or v_rescheduled.package_name <> 'W4 Deluxe Package' or v_rescheduled.package_price <> 1250.00 then
    raise exception 'RESCHEDULE_FAIL: package details not preserved';
  end if;

  -- Verify party size preserved
  if v_rescheduled.party_size <> 2 then
    raise exception 'RESCHEDULE_FAIL: party_size expected 2, got %', v_rescheduled.party_size;
  end if;

  -- Verify rescheduled_from pointer
  if v_rescheduled.rescheduled_from <> v_orig_appt.id then
    raise exception 'RESCHEDULE_FAIL: rescheduled_from mismatch';
  end if;

  -- Verify appointment_items copied
  select count(*) into v_item_count from public.appointment_items where appointment_id = v_rescheduled.id;
  if v_item_count <> 1 then
    raise exception 'RESCHEDULE_FAIL: items count expected 1, got %', v_item_count;
  end if;

  -- Verify original appointment cancelled with Rescheduled note
  select * into v_orig_check from public.appointments where id = v_orig_appt.id;
  if v_orig_check.status <> 'CANCELLED' or v_orig_check.cancelled_by <> 'CUSTOMER' or v_orig_check.response_note <> 'Rescheduled' then
    raise exception 'RESCHEDULE_FAIL: original appointment not cancelled properly: %', v_orig_check;
  end if;

  -------------------------------------------------------------
  -- 5. Test Guards: Walk-in & Notes Truncation
  -------------------------------------------------------------
  -- Walk-in rejection
  insert into public.appointments (
    target_type, target_id, target_owner_user_id, customer_user_id,
    scheduled_for, is_walk_in, status
  ) values (
    'BUSINESS', v_target_id, v_target_owner, v_cust_id,
    v_base_time + interval '4 hours', true, 'PENDING'
  ) returning id into v_walkin_id;

  set local role authenticated;
  begin
    perform public.reschedule_appointment(
      v_walkin_id,
      v_base_time + interval '5 hours',
      'Day 30',
      '02:00 PM'
    );
    reset role;
    raise exception 'WALKIN_GUARD_FAIL: Walk-in was not rejected';
  exception when others then
    reset role;
    if sqlerrm not like '%NOT_YOUR_BOOKING%' then
      raise exception 'WALKIN_GUARD_FAIL: unexpected error: %', sqlerrm;
    end if;
  end;

  -- Notes truncation to 2000 characters
  insert into public.appointments (
    target_type, target_id, target_owner_user_id, customer_user_id,
    scheduled_for, status
  ) values (
    'BUSINESS', v_target_id, v_target_owner, v_cust_id,
    v_base_time + interval '5 hours', 'PENDING'
  ) returning * into v_orig_appt;

  set local role authenticated;
  v_long_appt := public.reschedule_appointment(
    v_orig_appt.id,
    v_base_time + interval '6 hours',
    'Day 30',
    '03:00 PM',
    repeat('A', 3000)
  );
  reset role;

  if length(v_long_appt.notes) <> 2000 then
    raise exception 'NOTES_TRUNCATION_FAIL: expected 2000, got %', length(v_long_appt.notes);
  end if;

  -------------------------------------------------------------
  -- 6. FORCED ROLLBACK: Abort and prove 100% rollback
  -------------------------------------------------------------
  raise exception 'TEST_RESULT: ALL_CHECKS_PASSED';
end $test_block$;
`;

console.log("Executing W4 Forced-Rollback Behavioural Test via Supabase MCP...");

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
          console.log("   - 5-cap daily limit rejected 6th appointment as expected");
          console.log("   - Different customer unaffected by limit");
          console.log("   - Reschedule preserved PAID payment_status, method, amount, reference");
          console.log("   - Reschedule preserved package_id, package_name, package_price");
          console.log("   - Reschedule preserved party_size = 2");
          console.log("   - Reschedule copied appointment_items");
          console.log("   - Original appointment cancelled with 'Rescheduled' note");
          console.log("   - Walk-in reschedule rejected with NOT_YOUR_BOOKING");
          console.log("   - 3000-char notes truncated to exactly 2000 chars");
          console.log("   - Transaction fully aborted; 0 rows / 0 changes left in DB");
          console.log("=======================================================\n");
          child.kill();
          process.exit(0);
        } else {
          console.error("Test did not pass as expected! Output:", resultText);
          child.kill();
          process.exit(1);
        }
      }
    } catch (e) {
      // ignore non-json
    }
  }
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "w4-test", version: "1.0" },
  },
});
