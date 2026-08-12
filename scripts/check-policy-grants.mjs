// RLS role-access guard.
//
// WHY THIS EXISTS: when Postgres evaluates an RLS policy whose qual calls a
// function the current role cannot EXECUTE, it does not skip the branch or
// return false — it ABORTS THE WHOLE STATEMENT. The permission is resolved at
// executor init (ExecInitExpr -> fmgr_info), before any AND/OR short-circuit,
// so even an unreachable branch kills the query.
//
// This shipped three times before anything caught it:
//   20260842 — owners/employees could not write to businesses or queue_settings
//   20260870 — the same helpers regressed again
//   20260887 — 20260881/20260882 revoked anon EXECUTE on functions used inside
//              RLS policies, killing ALL guest browsing with "permission denied
//              for function is_admin"
// Each was found by a human noticing the app was broken.
// check-migration-drift.mjs cannot catch it (its own header says it does not
// verify grants) and the Playwright audit runs only from a signed-in session.
//
// WHAT IT DOES: for every RLS-enabled table in `public`, actually attempts a
// read as each role inside a transaction that is always rolled back, and
// reports any that abort with a privilege error (SQLSTATE 42501).
//
// WHY EMPIRICAL RATHER THAN STATIC: the first version of this script parsed
// pg_policies.qual for function names and checked has_function_privilege. It
// was wrong in both directions and is not worth resurrecting —
//   * false negatives — it matched only schema-qualified `public.fn(`, but
//     pg_get_expr deparses quals WITHOUT the schema, so it found 0 functions
//     across 185 policies and printed a green check while the DB was broken;
//     it also treated pg_policies.roles as a JS array when node-pg returns the
//     literal string "{authenticated}", skipping every policy;
//   * false positives — it flagged EVERY overload of a name (read_businesses
//     calls the granted is_admin(), not the revoked is_admin(text)), and could
//     not know the planner constant-folds a policy like `true OR fn(...)` so
//     the call is never initialized at all. That produced 11 warnings for
//     tables that demonstrably work.
// Executing the query is the only thing that answers the real question.
//
// USAGE:
//   DATABASE_URL="postgresql://...supabase connection string..." node scripts/check-policy-grants.mjs
//   (or `npm run check-policy-grants` with DATABASE_URL set in your shell/CI)
//
// Needs a role that can SET ROLE to anon/authenticated (the postgres superuser
// from the dashboard connection string does). Without DATABASE_URL it warns and
// exits 0 — same contract as check-migration-drift.mjs.

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn(
    "[check-policy-grants] DATABASE_URL not set — skipping (this is not a failure).\n" +
    "  Set it to verify RLS role access against the live database:\n" +
    "  Supabase Dashboard → Project Settings → Database → Connection string → URI."
  );
  process.exit(0);
}

const ROLES = ["anon", "authenticated"];

const { Client } = await import("pg");
const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const { rows: tables } = await client.query(`
    select c.relname as table
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    order by c.relname
  `);

  const problems = [];
  let checks = 0;

  for (const { table } of tables) {
    for (const role of ROLES) {
      checks++;
      // Rolled back regardless of outcome — this only ever reads, and LIMIT 0
      // still plans and initializes every applicable policy qual, which is
      // exactly the step that raises 42501.
      await client.query("begin");
      try {
        await client.query(`set local role ${role}`);
        await client.query(`select 1 from public.${JSON.stringify(table).replace(/"/g, '"')} limit 0`);
      } catch (err) {
        // 42501 covers TWO different things and only one is a bug:
        //   "permission denied for function ..." — an RLS policy calling a
        //      function this role can't EXECUTE. The statement aborts where it
        //      should have returned an empty set. THIS is what we're hunting.
        //   "permission denied for table ..." — a missing table-level GRANT,
        //      which is usually deliberate (credential stores, rate-limit
        //      tables and payments are intentionally unreadable by anon and
        //      authenticated). Reporting these would bury the real signal
        //      under a dozen expected denials.
        if (err.code === "42501" && /permission denied for function/i.test(err.message)) {
          problems.push(`  ${table} → role "${role}" → ${err.message}`);
        }
      } finally {
        await client.query("rollback");
      }
    }
  }

  if (problems.length > 0) {
    console.error(
      `\n\x1b[31m✖ ${problems.length} table/role combination(s) ABORT at runtime:\x1b[0m\n`
    );
    console.error(problems.join("\n"));
    console.error(
      "\nEach is an RLS policy calling a function that role cannot EXECUTE.\nFix by either:\n" +
      "  • scoping the policy   — alter policy <name> on public.<table> to authenticated;\n" +
      "  • or granting EXECUTE  — grant execute on function public.fn(args) to anon;\n" +
      "Prefer scoping when the policy was never meant to apply to that role: Postgres\n" +
      "only initializes policies applicable to the current role, so the function stays\n" +
      "revoked. See supabase/migrations/20260887 and 20260888.\n"
    );
    process.exit(1);
  }

  console.log(
    `\x1b[32m✔ Every RLS-enabled table is readable (or cleanly empty) for anon and ` +
    `authenticated — no policy aborts on a missing function grant ` +
    `(${checks} table/role checks across ${tables.length} tables).\x1b[0m`
  );
} finally {
  await client.end();
}
