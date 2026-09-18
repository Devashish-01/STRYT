#!/usr/bin/env node
/**
 * Runs the report-classification node against the live TypeSafe API on labelled cases, and prints how often its
 * priority and category agree with a moderator's.
 *
 *   node scripts/eval-report-classifier.mjs [cases.json] [--out results.json]
 *
 * Needs TYPESAFE_API_KEY in the environment or in .env. Runs the exact code the edge function ships (the marked
 * block in supabase/functions/classify-report/index.ts). The default cases are synthetic; to calibrate POLICY for
 * real, export moderator-labelled reports in the same shape and pass that file instead. Real report text is
 * personal data: keep such files out of git.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { transformSync } from "esbuild";

const FUNCTION_FILE = "supabase/functions/classify-report/index.ts";

function loadNode() {
  const src = readFileSync(FUNCTION_FILE, "utf8").replace(/\r\n/g, "\n");
  const a = src.indexOf("// >>> report-classifier");
  const b = src.indexOf("// <<< report-classifier");
  if (a < 0 || b < 0) throw new Error(`report-classifier markers missing in ${FUNCTION_FILE}`);
  const js = transformSync(src.slice(a, b), { loader: "ts" }).code;
  return new Function(`${js}\nreturn { classifyReport, POLICY };`)();
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
  const { classifyReport, POLICY } = loadNode();
  const { cases } = JSON.parse(readFileSync(casesFile, "utf8"));
  const results = [];
  let priorityOk = 0;
  let categoryOk = 0;
  let supportOk = 0;
  let supportCases = 0;
  let failures = 0;
  let inputTokens = 0;

  for (const c of cases) {
    const started = Date.now();
    try {
      const t = await classifyReport(c.input, { apiKey: key, fetch });
      const ms = Date.now() - started;
      inputTokens += t.usage?.input_tokens ?? 0;
      const pOk = c.expect.priority.includes(t.priority);
      // An uncertain answer agrees when every alternative it offers is acceptable (e.g. harassment / dangerous).
      const cOk = c.expect.category.includes(t.category) ||
        (t.category === "uncertain" && t.alternatives.length > 0 && t.alternatives.every((a) => c.expect.category.includes(a)));
      priorityOk += pOk ? 1 : 0;
      categoryOk += cOk ? 1 : 0;
      if (c.expect.support !== undefined) {
        supportCases++;
        supportOk += t.support === c.expect.support ? 1 : 0;
      }
      results.push({ id: c.id, expect: c.expect, triage: t, ms });
      const mark = pOk && cOk ? "ok  " : "DIFF";
      console.log(
        `${mark} ${c.id.padEnd(26)} priority ${t.priority.padEnd(6)} ${pOk ? " " : `(want ${c.expect.priority.join("/")})`}` +
          ` category ${t.category}@${t.categoryConfidence}${t.alternatives.length ? ` [${t.alternatives.join("/")}]` : ""}` +
          `${cOk ? "" : ` (want ${c.expect.category.join("/")})`}` +
          ` sev ${t.severity} flags [${t.flags.join(",")}]${t.support ? " SUPPORT" : ""} ${ms}ms`,
      );
    } catch (e) {
      failures++;
      results.push({ id: c.id, error: e.message });
      console.log(`ERR  ${c.id.padEnd(26)} ${e.message}`);
    }
  }

  const n = cases.length;
  console.log(`\npriority agrees ${priorityOk}/${n} · category agrees ${categoryOk}/${n}` +
    (supportCases ? ` · support flag ${supportOk}/${supportCases}` : "") +
    (failures ? ` · ${failures} request(s) failed` : ""));
  console.log(`input tokens: ${inputTokens} total, ${Math.round(inputTokens / Math.max(1, n - failures))} per report`);
  console.log(`policy: ${JSON.stringify(POLICY)}`);
  if (outFile) writeFileSync(outFile, JSON.stringify({ casesFile, policy: POLICY, results }, null, 2));
  if (failures) process.exitCode = 1;
}
