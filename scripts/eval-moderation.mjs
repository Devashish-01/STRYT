#!/usr/bin/env node
/**
 * Runs the moderation node against the live TypeSafe API on labelled cases, and prints how often it agrees with a
 * moderator.
 *
 *   node scripts/eval-moderation.mjs [cases.json] [--out results.json]
 *
 * Two kinds of case file, told apart by "mode":
 *   - report triage (default): each case expects a priority and a category — scripts/report-classifier-cases.json;
 *   - "content": the automatic check on a new post or comment; each case expects an action (hide / review / pass) —
 *     scripts/content-check-cases.json. The number that matters most there is ordinary posts hidden by mistake.
 *
 * Needs TYPESAFE_API_KEY in the environment or in .env. Runs the exact code the edge function ships (the marked
 * block in supabase/functions/moderation/index.ts). The default cases are synthetic; to re-set the thresholds for
 * real, export moderator-labelled items in the same shape. Real text is personal data: keep such files out of git.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { transformSync } from "esbuild";

const FUNCTION_FILE = "supabase/functions/moderation/index.ts";

function loadNode() {
  const src = readFileSync(FUNCTION_FILE, "utf8").replace(/\r\n/g, "\n");
  const a = src.indexOf("// >>> report-classifier");
  const b = src.indexOf("// <<< report-classifier");
  if (a < 0 || b < 0) throw new Error(`report-classifier markers missing in ${FUNCTION_FILE}`);
  const js = transformSync(src.slice(a, b), { loader: "ts" }).code;
  return new Function(`${js}\nreturn { classifyReport, classifyContent, POLICY, CONTENT_POLICY };`)();
}

function apiKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  if (!existsSync(".env")) return "";
  // Split on \r?\n: in a JS regex `.` stops at \r, so a CRLF .env would otherwise never match.
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*TYPESAFE_API_KEY\s*=\s*"?([^"]*)"?\s*$/);
    if (m) return m[1];
  }
  return "";
}

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const casesFile =
  args.find((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1)) ?? "scripts/report-classifier-cases.json";

const key = apiKey();
if (!key) {
  console.error("TYPESAFE_API_KEY is not set (environment or .env).");
  process.exitCode = 2;
} else {
  const node = loadNode();
  const { mode, cases } = JSON.parse(readFileSync(casesFile, "utf8"));
  const content = mode === "content";
  const results = [];
  let agree = 0;
  let categoryOk = 0;
  let supportOk = 0;
  let supportCases = 0;
  let failures = 0;
  let inputTokens = 0;
  let wrongHides = 0;
  let benign = 0;

  for (const c of cases) {
    const started = Date.now();
    try {
      const opts = { apiKey: key, fetch };
      const t = content ? await node.classifyContent(c.input, opts) : await node.classifyReport(c.input, opts);
      const ms = Date.now() - started;
      inputTokens += t.usage?.input_tokens ?? 0;
      if (c.expect.support !== undefined) {
        supportCases++;
        supportOk += t.support === c.expect.support ? 1 : 0;
      }
      let ok;
      let line;
      if (content) {
        ok = c.expect.action.includes(t.action);
        agree += ok ? 1 : 0;
        if (!c.expect.action.includes("hide")) {
          benign++;
          if (t.action === "hide") wrongHides++;
        }
        line = `action ${t.action.padEnd(6)} ${ok ? " " : `(want ${c.expect.action.join("/")})`}` +
          ` category ${t.category}@${t.categoryConfidence} sev ${t.severity} flags [${t.flags.join(",")}]`;
      } else {
        const pOk = c.expect.priority.includes(t.priority);
        // An uncertain answer agrees when every alternative it offers is acceptable (e.g. harassment / dangerous).
        const cOk = c.expect.category.includes(t.category) ||
          (t.category === "uncertain" && t.alternatives.length > 0 && t.alternatives.every((a) => c.expect.category.includes(a)));
        ok = pOk && cOk;
        agree += pOk ? 1 : 0;
        categoryOk += cOk ? 1 : 0;
        line = `priority ${t.priority.padEnd(6)} ${pOk ? " " : `(want ${c.expect.priority.join("/")})`}` +
          ` category ${t.category}@${t.categoryConfidence}${t.alternatives.length ? ` [${t.alternatives.join("/")}]` : ""}` +
          `${cOk ? "" : ` (want ${c.expect.category.join("/")})`} sev ${t.severity} flags [${t.flags.join(",")}]`;
      }
      results.push({ id: c.id, expect: c.expect, result: t, ms });
      console.log(`${ok ? "ok  " : "DIFF"} ${c.id.padEnd(30)} ${line}${t.support ? " SUPPORT" : ""} ${ms}ms`);
    } catch (e) {
      failures++;
      results.push({ id: c.id, error: e.message });
      console.log(`ERR  ${c.id.padEnd(30)} ${e.message}`);
    }
  }

  const n = cases.length;
  const done = Math.max(1, n - failures);
  if (content) {
    console.log(`\naction agrees ${agree}/${n} · ordinary items hidden by mistake ${wrongHides}/${benign}` +
      (supportCases ? ` · support flag ${supportOk}/${supportCases}` : "") +
      (failures ? ` · ${failures} request(s) failed` : ""));
    console.log(`policy: ${JSON.stringify(node.CONTENT_POLICY)}`);
  } else {
    console.log(`\npriority agrees ${agree}/${n} · category agrees ${categoryOk}/${n}` +
      (supportCases ? ` · support flag ${supportOk}/${supportCases}` : "") +
      (failures ? ` · ${failures} request(s) failed` : ""));
    console.log(`policy: ${JSON.stringify(node.POLICY)}`);
  }
  console.log(`input tokens: ${inputTokens} total, ${Math.round(inputTokens / done)} per item`);
  if (outFile) writeFileSync(outFile, JSON.stringify({ casesFile, mode: mode ?? "report", results }, null, 2));
  if (failures) process.exitCode = 1;
}
