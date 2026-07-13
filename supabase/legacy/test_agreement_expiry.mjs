import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readEnv() {
  const envPath = join(__dirname, "..", "..", ".env");
  const out = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

const env = readEnv();
const token = env.SUPABASE_AT;
const urlMatch = (env.VITE_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
const ref = urlMatch?.[1];

if (!token || !ref) {
  console.error("✗ Need SUPABASE_AT and VITE_SUPABASE_URL in .env");
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(query) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function runTest() {
  console.log(`→ Project Ref: ${ref}`);

  const tempU1 = 'a1d2e3f4-5678-1234-5678-1234567890ab';
  const tempU2 = 'b2c3d4e5-6789-2345-6789-234567890abc';

  // 1. Clean up referencing tables FIRST to prevent FK violations when managing users
  console.log("→ Cleaning up stale test records...");
  await runSql(`
    delete from public.agreements where request_id = 'r_temp_exp' or requester_user_id in ('${tempU1}', '${tempU2}') or responder_user_id in ('${tempU1}', '${tempU2}');
    delete from public.proposals where request_id = 'r_temp_exp' or responder_user_id in ('${tempU1}', '${tempU2}');
    delete from public.requests where id = 'r_temp_exp' or requester_user_id in ('${tempU1}', '${tempU2}');
  `);

  // Fetch existing users or create them dynamically if missing.
  const usersRes = await runSql("select id from public.users limit 2");
  const users = usersRes[0]?.rows || [];
  let u1, u2;
  let createdUsers = false;
  
  if (users.length < 2) {
    console.log("→ Less than 2 users found. Creating temporary test users with valid UUIDs...");
    await runSql(`delete from public.users where id in ('${tempU1}', '${tempU2}')`);
    await runSql(`
      insert into public.users (id, name) values 
      ('${tempU1}', 'Test User 1'),
      ('${tempU2}', 'Test User 2')
    `);
    u1 = tempU1;
    u2 = tempU2;
    createdUsers = true;
  } else {
    u1 = users[0].id;
    u2 = users[1].id;
  }
  console.log(`✓ Using users: requester=${u1}, responder=${u2}`);

  // Insert mock request
  console.log("→ Inserting mock request 'r_temp_exp'...");
  await runSql(`
    insert into public.requests (id, requester_user_id, title, description, category_id, status)
    values ('r_temp_exp', '${u1}', 'Test Expiry Request', 'A test request', 'c-home-plumb', 'OPEN')
  `);

  // Insert mock proposals
  console.log("→ Inserting mock proposals...");
  await runSql(`
    insert into public.proposals (id, request_id, responder_user_id, price, message, status)
    values ('p_temp_exp', 'r_temp_exp', '${u2}', 500, 'I can do it!', 'SUBMITTED')
  `);
  await runSql(`
    insert into public.proposals (id, request_id, responder_user_id, price, message, status)
    values ('p_temp_exp_2', 'r_temp_exp', '${u2}', 600, 'Cheap and fast', 'SUBMITTED')
  `);

  // Accept proposal (creates agreement)
  console.log("→ Simulating proposal acceptance...");
  // Set auth context for accept_proposal RPC
  const acceptRes = await runSql(`
    begin;
    set local request.jwt.claims to '{"sub": "${u1}"}';
    select public.accept_proposal('p_temp_exp') as agid;
    commit;
  `);
  const errRes = acceptRes.find(r => r.error);
  if (errRes) {
    throw new Error(`Postgres transaction error: ${errRes.error.message}`);
  }
  let agId;
  for (const r of acceptRes) {
    if (r.agid) {
      agId = r.agid;
      break;
    }
    if (r.rows && r.rows[0] && r.rows[0].agid) {
      agId = r.rows[0].agid;
      break;
    }
  }
  if (!agId) throw new Error("Could not find created agreement ID in transaction results! Results: " + JSON.stringify(acceptRes));
  console.log(`✓ Proposal accepted. Created Agreement ID: ${agId}`);

  // Retrieve states right after acceptance
  let agState = await runSql(`select status, requester_confirmed, responder_confirmed from public.agreements where id = '${agId}'`);
  let reqState = await runSql("select status from public.requests where id = 'r_temp_exp'");
  let prop1State = await runSql("select status from public.proposals where id = 'p_temp_exp'");
  let prop2State = await runSql("select status from public.proposals where id = 'p_temp_exp_2'");

  console.log("\nInitial State:");
  // Access rows depending on whether the response is a transaction result set or raw row array
  const getRows = (res) => {
    if (!res) return [];
    if (Array.isArray(res)) {
      if (res[0] && typeof res[0] === "object" && "rows" in res[0]) {
        return res[0].rows || [];
      }
      return res;
    }
    return res.rows || [];
  };

  const agRows = getRows(agState);
  const reqRows = getRows(reqState);
  const prop1Rows = getRows(prop1State);
  const prop2Rows = getRows(prop2State);

  console.log(`- Agreement status: ${agRows[0]?.status} (confirmed: req=${agRows[0]?.requester_confirmed}, res=${agRows[0]?.responder_confirmed})`);
  console.log(`- Request status: ${reqRows[0]?.status}`);
  console.log(`- Accepted proposal status: ${prop1Rows[0]?.status}`);
  console.log(`- Sibling proposal status: ${prop2Rows[0]?.status}`);

  if (agRows[0]?.status !== "PENDING" || reqRows[0]?.status !== "IN_PROGRESS" || prop1Rows[0]?.status !== "ACCEPTED" || prop2Rows[0]?.status !== "REJECTED") {
    throw new Error("Initial states are incorrect!");
  }

  // Manually update created_at of agreement to be 11 minutes in the past
  console.log("\n→ Mocking agreement created_at to 11 minutes ago...");
  await runSql(`update public.agreements set created_at = now() - interval '11 minutes' where id = '${agId}'`);

  // Run lazy cancellation
  console.log("→ Executing cancel_expired_agreements() RPC...");
  await runSql("select public.cancel_expired_agreements()");

  // Retrieve states after expiration check
  agState = await runSql(`select status from public.agreements where id = '${agId}'`);
  reqState = await runSql("select status from public.requests where id = 'r_temp_exp'");
  prop1State = await runSql("select status from public.proposals where id = 'p_temp_exp'");
  prop2State = await runSql("select status from public.proposals where id = 'p_temp_exp_2'");

  const agRowsAfter = getRows(agState);
  const reqRowsAfter = getRows(reqState);
  const prop1RowsAfter = getRows(prop1State);
  const prop2RowsAfter = getRows(prop2State);

  console.log("\nState After Expiration:");
  console.log(`- Agreement status: ${agRowsAfter[0]?.status}`);
  console.log(`- Request status: ${reqRowsAfter[0]?.status}`);
  console.log(`- Accepted proposal status: ${prop1RowsAfter[0]?.status}`);
  console.log(`- Sibling proposal status: ${prop2RowsAfter[0]?.status}`);

  // Assertions
  if (agRowsAfter[0]?.status !== "CANCELLED") throw new Error("Agreement was not cancelled!");
  if (reqRowsAfter[0]?.status !== "OPEN") throw new Error("Request was not reverted to OPEN!");
  if (prop1RowsAfter[0]?.status !== "SUBMITTED") throw new Error("Accepted proposal was not reverted to SUBMITTED!");
  if (prop2RowsAfter[0]?.status !== "SUBMITTED") throw new Error("Sibling proposal was not reverted to SUBMITTED!");

  console.log("\n✓ ALL TESTS PASSED SUCCESSFULLY!");

  // Clean up
  console.log("\n→ Cleaning up test records...");
  await runSql("delete from public.agreements where request_id = 'r_temp_exp'");
  await runSql("delete from public.proposals where request_id = 'r_temp_exp'");
  await runSql("delete from public.requests where id = 'r_temp_exp'");
  if (createdUsers) {
    console.log("→ Cleaning up temporary test users...");
    await runSql(`delete from public.users where id in ('${u1}', '${u2}')`);
  }
}

runTest()
  .catch((err) => {
    console.error(`\n✗ Test failed: ${err.message}`);
    process.exitCode = 1;
  });
