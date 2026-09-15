// Renders docs/security/DATA_ACCESS_MATRIX.md from the JSON written by data-access-tests.mjs.
// Usage: node scripts/audit/render-data-access-matrix.mjs docs/security/data-access-results.json docs/security/DATA_ACCESS_MATRIX.md
import fs from "fs";

const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error("usage: render-data-access-matrix.mjs <results.json> <out.md>"); process.exit(1); }
const data = JSON.parse(fs.readFileSync(inp, "utf8"));
const ACTORS = ["anon", "stranger", "participant", "owner", "team_right", "team_wrong"];
const v = (x) => (x === null || x === undefined ? "–" : x);

function cell(r, actor) {
  const a = r[actor];
  if (!a || a === "n/a") return "n/a";
  const s = actor === "anon" || actor === "stranger" ? `${v(a.visible)}` : `${v(a.visible_in_scope)}/${v(a.in_scope)}`;
  const denied = (a.errors || "").match(/S:42501/) ? "✗" : s;
  const u = (a.errors || "").match(/U:42501/) ? "✗" : v(a.update);
  const d = (a.errors || "").match(/D:42501/) ? "✗" : v(a.delete);
  return `${denied} · ${u} · ${d}`;
}

const flags = [];
const rows = data.tables.map((t) => {
  const r = t.result || {};
  if (r.error || r.parse_error) return `| \`${t.table}\` | – | test error | | | | | |`;
  for (const actor of ["anon", "stranger", "team_wrong"]) {
    const a = r[actor];
    if (a && a !== "n/a" && ((a.update || 0) > 0 || (a.delete || 0) > 0)) flags.push(`\`${t.table}\`: ${actor} changed rows (update ${a.update}, delete ${a.delete})`);
  }
  return `| \`${t.table}\` | ${r.rows} | ${ACTORS.map((a) => cell(r, a)).join(" | ")} |`;
});

const md = `# Personal-data access matrix

**Generated:** ${data.generated_at} from \`${inp}\` by \`scripts/audit/render-data-access-matrix.mjs\`.
**Tests:** \`scripts/audit/data-access-tests.mjs\` — real queries on production (\`${data.project}\`), one forced-rollback
transaction per table, each actor in its own rolled-back sub-block. Nothing was kept.

> Replaces the P05 matrix generated on 2026-09-15 by \`build-data-access-matrix.mjs\`, which ran no queries: every
> cell was \`-/-/-/-\` and every table was marked SAFE. The first real run (before migrations 20260968–20260972)
> found a stranger reading password and recovery hashes, emails and exact locations from \`users\`, a stranger
> deleting business stories, and direct edits of agreements and bookings — see \`supabase/APPLY_LOG.md\` rows 31–35.

## How to read a cell

\`visible · update · delete\`

- **anon / stranger:** rows the actor can SELECT out of all rows · rows an UPDATE (\`pk = pk\`) touched · rows a DELETE touched.
- **participant / owner / team:** rows of *their own* scope they can SELECT / rows in that scope · UPDATE · DELETE (the
  update and delete run over the whole table, so they count every row the actor may change).
- \`✗\` = refused by privileges (42501). \`n/a\` = the table has no such relationship, or no fixture existed.
- **stranger** = a signed-in user id that owns nothing. **participant** = the user most present in the table's user
  column. **owner** = owner of the business most present in \`business_id\`. **team_right / team_wrong** = a fresh
  active scoped team session with / without the scope that domain needs (only for tables mapped in the script).
- INSERT is not tested generically. Inserts that matter were tested per table: stories, leads (20260971, 20260972).

## Matrix

| Table | Rows | anon | stranger | participant | owner | team_right | team_wrong |
|---|---:|---|---|---|---|---|---|
${rows.join("\n")}

## Rows a guest, stranger or wrong-scope team member could change

${flags.length ? flags.map((f) => `- ${f}`).join("\n") : "None."}

## Reading this correctly

- High **stranger visible** counts on \`businesses\`, \`providers\`, \`categories\`, \`catalog_items\`, \`places\`,
  \`requests\`, \`community_posts\`, \`post_comments\`, \`request_me_toos\`, \`societies\` and everyone-visibility
  \`stories\` are public listings by design.
- \`users\` rows stay visible to signed-in users (profiles), but since 20260968 only non-sensitive columns are
  readable. Contact numbers: see \`supabase/pending/users_phone_column_lockdown.sql\` (after the app release).
- Participant/owner update counts are the actor's own rows (policy-allowed); the database functions still enforce the
  business rules for status and payment changes where the direct update path was removed (20260969, 20260970).
`;
fs.writeFileSync(out, md);
console.log("wrote", out, "| tables:", data.tables.length, "| change flags:", flags.length);
for (const f of flags) console.log("  FLAG", f);
