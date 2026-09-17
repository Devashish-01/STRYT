// Cron health guard for STRYT (P14 §14.B.7).
//
// Three pg_cron jobs do work nobody watches:
//   close-expired-bulk-deals          */10 * * * *
//   close-expired-business-sessions   * * * * *
//   notify-ended-polls                */10 * * * *
//
// If one of them stops, nothing surfaces it. Deals stay open past their deadline, polls never notify, and —
// the one that matters most — a revoked or expired team-access session keeps working, because expiring it is
// that job's entire purpose. This fails the nightly guardrails run when a job has failed recently or has
// stopped running at all.
//
// USAGE:
//   node scripts/check-cron-health.mjs                       # .env SUPABASE_PERSONAL_ACCESS_TOKEN
//   SUPABASE_PROJECT_REF=<ref> node scripts/check-cron-health.mjs
//   DATABASE_URL="postgresql://..." node scripts/check-cron-health.mjs
//
// A NOTE ON PERMISSIONS, because the phase plan expected a grant migration and it turned out not to be the
// problem. `cron.job` and `cron.job_run_details` already grant SELECT to PUBLIC — but both have RLS enabled,
// and pg_cron's own policy restricts rows to the job's owner. So granting SELECT to a least-privilege role
// gets you a connection that can query the tables and sees zero rows, which reads exactly like a healthy
// database with no jobs. That is the worst possible failure mode for a monitor.
//
// This therefore runs through the Management API (or a DATABASE_URL whose role owns the jobs), the same way
// check-migration-drift.mjs does. If the direct ci_readonly path is wanted later, the fix is a SECURITY
// DEFINER function in `public` that returns the summary — not a grant.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/** A job that has not run in this many times its own interval is treated as stopped. */
const MISSED_INTERVAL_FACTOR = 2;
/** Failures are only interesting if they are recent. */
const FAILURE_WINDOW_HOURS = 24;

function readEnvFile() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return {};
  const out = {};
  // Split on /\r?\n/, not "\n". In a JavaScript regex `\r` is a line terminator, so `.` does not match it
  // and `(.*)$` fails on every line of a CRLF file — which is every file on this machine. Before this the
  // parser silently returned an empty object and the check skipped itself, reporting success.
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

/**
 * Every active job, when it last ran, and how it went. Expressed in SQL rather than in JS so the interval
 * arithmetic is Postgres's, which is the same clock the scheduler uses.
 */
const QUERY = `
set transaction read only;
with last_run as (
  select jobid, max(start_time) as last_start
  from cron.job_run_details
  group by jobid
),
recent as (
  select jobid,
         count(*) filter (where status <> 'succeeded') as failures,
         max(start_time) filter (where status <> 'succeeded') as last_failure,
         (array_agg(return_message order by start_time desc)
            filter (where status <> 'succeeded'))[1] as last_failure_message
  from cron.job_run_details
  where start_time > now() - interval '${FAILURE_WINDOW_HOURS} hours'
  group by jobid
)
select j.jobname,
       j.schedule,
       j.active,
       lr.last_start,
       coalesce(r.failures, 0) as failures,
       r.last_failure,
       r.last_failure_message,
       extract(epoch from (now() - lr.last_start)) as seconds_since_last_run
from cron.job j
left join last_run lr on lr.jobid = j.jobid
left join recent r on r.jobid = j.jobid
where j.active
order by j.jobname;
`;

/** Turns a cron expression into the number of seconds between runs. Only the shapes this project uses. */
export function expectedIntervalSeconds(schedule) {
  const s = String(schedule || "").trim();
  if (s === "* * * * *") return 60;
  const everyNMinutes = s.match(/^\*\/(\d+) \* \* \* \*$/);
  if (everyNMinutes) return Number(everyNMinutes[1]) * 60;
  const everyNHours = s.match(/^\d+ \*\/(\d+) \* \* \*$/);
  if (everyNHours) return Number(everyNHours[1]) * 3600;
  if (/^\d+ \d+ \* \* \*$/.test(s)) return 24 * 3600; // daily at a fixed time
  if (/^\d+ \* \* \* \*$/.test(s)) return 3600; // hourly at a fixed minute
  return null; // unknown shape — reported, never silently treated as healthy
}

/** Decides on one job. Exported so the logic is testable without a database. */
export function assessJob(job, nowSeconds = null) {
  const problems = [];
  const interval = expectedIntervalSeconds(job.schedule);
  const since = nowSeconds ?? Number(job.seconds_since_last_run);

  if (job.last_start == null) {
    problems.push("has never run");
  } else if (interval == null) {
    problems.push(`schedule "${job.schedule}" is not a shape this check understands — verify it by hand`);
  } else if (since > interval * MISSED_INTERVAL_FACTOR) {
    const mins = Math.round(since / 60);
    problems.push(
      `last ran ${mins} min ago, which is more than ${MISSED_INTERVAL_FACTOR}x its ${Math.round(interval / 60)} min schedule`,
    );
  }

  if (Number(job.failures) > 0) {
    problems.push(
      `${job.failures} failed run(s) in the last ${FAILURE_WINDOW_HOURS}h` +
        (job.last_failure_message ? ` — last: ${String(job.last_failure_message).slice(0, 200)}` : ""),
    );
  }
  return problems;
}

async function queryViaManagementApi(ref, token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function queryViaPg(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query(QUERY);
    return res.rows;
  } finally {
    await client.end();
  }
}

async function main() {
  // process.env wins, but only where it actually holds a value — an empty string must not mask the file.
  const env = { ...readEnvFile() };
  for (const [k, v] of Object.entries(process.env)) if (v) env[k] = v;
  let rows;

  if (env.DATABASE_URL) {
    rows = await queryViaPg(env.DATABASE_URL);
  } else if (env.SUPABASE_PERSONAL_ACCESS_TOKEN) {
    const ref = env.SUPABASE_PROJECT_REF || env.STAGING_PROJECT_REF;
    if (!ref) {
      console.log("[check-cron-health] No project ref (SUPABASE_PROJECT_REF). Skipping.");
      return 0;
    }
    rows = await queryViaManagementApi(ref, env.SUPABASE_PERSONAL_ACCESS_TOKEN);
  } else {
    // Same posture as check-migration-drift: absent credentials are a skip, not a failure, so the workflow
    // stays green until the secret is provisioned.
    console.log(
      "[check-cron-health] No database credentials (DATABASE_URL or SUPABASE_PERSONAL_ACCESS_TOKEN). Skipping.",
    );
    return 0;
  }

  if (!Array.isArray(rows)) {
    console.error("[check-cron-health] Unexpected response:", JSON.stringify(rows).slice(0, 300));
    return 1;
  }

  if (rows.length === 0) {
    // Zero active jobs is either a real problem or a permissions illusion — see the note at the top.
    console.error(
      "[check-cron-health] No active cron jobs visible. Either they are all gone, or this connection's role " +
        "cannot see them through pg_cron's RLS. Both need a human.",
    );
    return 1;
  }

  let bad = 0;
  for (const job of rows) {
    const problems = assessJob(job);
    if (problems.length === 0) {
      const mins = Math.round(Number(job.seconds_since_last_run) / 60);
      console.log(`  ok    ${job.jobname.padEnd(34)} ${job.schedule.padEnd(14)} last run ${mins} min ago`);
    } else {
      bad++;
      console.error(`  FAIL  ${job.jobname.padEnd(34)} ${job.schedule}`);
      for (const p of problems) console.error(`        ${p}`);
    }
  }

  console.log(`\n[check-cron-health] ${rows.length} active job(s), ${bad} with problems.`);
  return bad > 0 ? 1 : 0;
}

// Only run when invoked directly, so the helpers above can be unit-tested.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  // exitCode rather than process.exit(): exiting while the fetch's handles are still closing trips a libuv
  // assertion on Windows (UV_HANDLE_CLOSING) and reports 127 even when every job was healthy.
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error("[check-cron-health]", err.message);
      process.exitCode = 1;
    });
}
