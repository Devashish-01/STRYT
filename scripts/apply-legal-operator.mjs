#!/usr/bin/env node
/**
 * apply-legal-operator.mjs
 *
 * Reads legal/operator.yaml and substitutes bracket tokens across legal/*.md,
 * removes draft / not-in-force banners, sets Effective Date / Last Updated,
 * and bumps LEGAL_VERSION in src/lib/legal.ts.
 *
 * Usage:
 *   1. Fill legal/operator.yaml (required fields must be non-empty)
 *   2. node scripts/apply-legal-operator.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yamlPath = join(root, "legal", "operator.yaml");

function parseSimpleYaml(text) {
  /** Minimal key: value parser (no nested objects). Supports quoted strings. */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const op = parseSimpleYaml(readFileSync(yamlPath, "utf8"));

const required = [
  "operator_legal_name",
  "registered_address",
  "grievance_officer_name",
  "grievance_officer_email",
  "jurisdiction_city_state",
  "effective_date",
  "legal_version",
];

const missing = required.filter((k) => !op[k] || !String(op[k]).trim());
if (missing.length) {
  console.error("Missing required fields in legal/operator.yaml:");
  for (const k of missing) console.error(`  - ${k}`);
  console.error("\nFill them in, then re-run this script.");
  process.exit(1);
}

const officerLabel = op.grievance_officer_phone
  ? `${op.grievance_officer_name}, ${op.grievance_officer_designation || "Grievance Officer"} — ${op.grievance_officer_email} / ${op.grievance_officer_phone}`
  : `${op.grievance_officer_name}, ${op.grievance_officer_designation || "Grievance Officer"} — ${op.grievance_officer_email}`;

const replacements = [
  // Exact bracket tokens used across the legal pack
  ["[STRYT OPERATOR LEGAL NAME]", op.operator_legal_name],
  ["[STRYT OPERATOR LEGAL NAME — e.g. \"____ Private Limited\" / proprietorship name]", op.operator_legal_name],
  ["`[STRYT OPERATOR LEGAL NAME]`", op.operator_legal_name],
  ["`[STRYT OPERATOR LEGAL NAME — e.g. \"____ Private Limited\" / proprietorship name]`", op.operator_legal_name],
  ["[REGISTERED ADDRESS]", op.registered_address],
  ["[REGISTERED ADDRESS, City, State, PIN]", op.registered_address],
  ["`[REGISTERED ADDRESS]`", op.registered_address],
  ["`[REGISTERED ADDRESS, City, State, PIN]`", op.registered_address],
  ["[REGISTERED OFFICE ADDRESS]", op.registered_address],
  ["[REGISTERED OFFICE ADDRESS - Section 0]", op.registered_address],
  ["`[REGISTERED OFFICE ADDRESS]`", op.registered_address],
  ["`[REGISTERED OFFICE ADDRESS - Section 0]`", op.registered_address],
  ["[CIN or firm registration number, if applicable]", op.cin_or_registration || "Not applicable"],
  ["`[CIN or firm registration number, if applicable]`", op.cin_or_registration || "Not applicable"],
  ["[GST number, if registered]", op.gstin || "Not applicable"],
  ["`[GST number, if registered]`", op.gstin || "Not applicable"],
  ["[GRIEVANCE OFFICER NAME]", op.grievance_officer_name],
  ["`[GRIEVANCE OFFICER NAME]`", op.grievance_officer_name],
  ["[NAME, designation]", `${op.grievance_officer_name}, ${op.grievance_officer_designation || "Grievance Officer"}`],
  ["`[NAME, designation]`", `${op.grievance_officer_name}, ${op.grievance_officer_designation || "Grievance Officer"}`],
  ["[NAME, designation, email, phone — see grievance-redressal-policy.md]", officerLabel],
  ["`[NAME, designation, email, phone — see grievance-redressal-policy.md]`", officerLabel],
  ["[NAME]", op.grievance_officer_name],
  ["`[NAME]`", op.grievance_officer_name],
  ["[grievance@stryt.in — provision this dedicated address]", op.grievance_officer_email],
  ["`[grievance@stryt.in — provision this dedicated address]`", op.grievance_officer_email],
  ["[grievance@stryt.in]", op.grievance_officer_email],
  ["`[grievance@stryt.in]`", op.grievance_officer_email],
  ["[CITY, STATE OF REGISTERED OFFICE - e.g. \"Pune, Maharashtra\"]", op.jurisdiction_city_state],
  ["`[CITY, STATE OF REGISTERED OFFICE - e.g. \"Pune, Maharashtra\"]`", op.jurisdiction_city_state],
  ["[CITY, STATE OF REGISTERED OFFICE]", op.jurisdiction_city_state],
];

const headerEffective = [
  [/^\*\*Effective Date:\*\*.*$/m, `**Effective Date:** ${op.effective_date}`],
  [/^\*\*Last Updated:\*\*.*$/m, `**Last Updated:** ${op.effective_date}`],
  [/^\*\*Version:\*\*.*$/m, `**Version:** 1.0`],
];

const stripPatterns = [
  /\n?> \*\*Reviewer's note \(delete before publication\)\.\*\*[^\n]*\n?/g,
  /\n?> This Privacy Policy was drafted from a direct reading[\s\S]*?\n\n---/g,
  /\n?\*This document is a draft prepared for legal review and is not yet in force\.\*\n?/g,
  /\n?\*This document is a draft prepared for legal review and is not yet in force\. The Grievance Officer details and any additional[^\n]*\n?/g,
  /\n?\*Drafted 19 July 2026\. Do not publish without legal review\.\*\n?/g,
];

const legalDir = join(root, "legal");
const files = readdirSync(legalDir).filter((f) => f.endsWith(".md") && f !== "OPERATOR.md" && f !== "README.md");

let changed = 0;
for (const file of files) {
  const path = join(legalDir, file);
  let text = readFileSync(path, "utf8");
  const before = text;

  for (const [from, to] of replacements) {
    if (text.includes(from)) text = text.split(from).join(to);
  }
  for (const [re, to] of headerEffective) {
    text = text.replace(re, to);
  }
  for (const re of stripPatterns) {
    text = text.replace(re, "\n---");
  }
  // Collapse accidental duplicate --- separators
  text = text.replace(/(?:\n---\n){2,}/g, "\n---\n");

  // Section 0 heading cleanup
  text = text.replace(
    "## 0. Operator Information (to be completed before publication)",
    "## 0. Operator Information",
  );

  // Terms §54 draft clause → published
  text = text.replace(
    /54\.2 This version \(1\.0\) is a \*\*draft prepared for legal review\*\* and is not yet in force\.[^\n]*/g,
    `54.2 This version (1.0) is effective as of ${op.effective_date}. Material updates will bump the in-app legal version and re-prompt acceptance.`,
  );

  if (text !== before) {
    writeFileSync(path, text);
    changed++;
    console.log(`updated ${file}`);
  }
}

// Bump LEGAL_VERSION for the clickwrap gate
const legalTs = join(root, "src", "lib", "legal.ts");
let legalSrc = readFileSync(legalTs, "utf8");
const nextLegal = legalSrc.replace(
  /export const LEGAL_VERSION = "[^"]+";/,
  `export const LEGAL_VERSION = "${op.legal_version}";`,
);
if (nextLegal !== legalSrc) {
  writeFileSync(legalTs, nextLegal);
  console.log(`bumped LEGAL_VERSION → ${op.legal_version}`);
}

// Refresh README status
const readmePath = join(legalDir, "README.md");
let readme = readFileSync(readmePath, "utf8");
readme = readme.replace(
  /> \*\*Status: DRAFT for legal review — not yet in force\.\*\*[^\n]*/,
  `> **Status: Published ${op.effective_date}.** Operator identity is sourced from \`operator.yaml\`. Re-run \`node scripts/apply-legal-operator.mjs\` after edits.`,
);
readme = readme.replace(
  /\*Drafted 19 July 2026\. Do not publish without legal review\.\*/,
  `*Published ${op.effective_date}. Update via operator.yaml + apply-legal-operator.mjs.*`,
);
writeFileSync(readmePath, readme);

console.log(`\nDone. ${changed} policy file(s) updated.`);
console.log(`Privacy URL (in-app): /legal/privacy-policy`);
console.log(`Privacy URL (web):    https://stryt.in/legal/privacy-policy`);
