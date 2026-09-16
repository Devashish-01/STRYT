// Read-only audit: finds visible <label> elements that name a single form control but aren't tied to it, so a screen
// reader announces the control with no name ("edit text") and tapping the label doesn't focus the field (E2E-033).
//
// Counted as a finding: a <label> with no htmlFor whose next element (within 3 lines) is an <input>, <textarea> or
// <select> carrying neither an id nor an aria-label of its own.
// Not counted: a label that wraps its control (already associated), and a label that names a group of chips, toggles
// or buttons rather than one control — those need a grouping role, not htmlFor.
//
// Usage: node scripts/audit/label-association.mjs        (exit 1 if anything is found)
import fs from "fs";
import path from "path";

const ROOT = path.resolve(new URL("../../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const CONTROL = /<(input|textarea|select)\b/;
const LABEL = /<label\b/;
const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "future-enhancement") walk(full);
      continue;
    }
    if (!entry.name.endsWith(".tsx")) continue;
    const lines = fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n").split("\n");
    lines.forEach((line, i) => {
      if (!LABEL.test(line) || line.includes("htmlFor=") || CONTROL.test(line)) return;

      // A label that wraps its control is already associated.
      const labelBlock = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
      const closing = labelBlock.indexOf("</label>");
      if (closing > 0 && CONTROL.test(labelBlock.slice(0, closing))) return;

      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (LABEL.test(lines[j]) || lines[j].includes("</div>")) break;
        if (!CONTROL.test(lines[j])) continue;
        // Read the whole control element: attributes are usually spread over several lines.
        const element = lines.slice(j, Math.min(j + 14, lines.length)).join("\n").split(/\/>/)[0];
        if (!element.includes("aria-label=") && !/\sid=/.test(element)) {
          findings.push(`${path.relative(ROOT, full).replace(/\\/g, "/")}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
        break;
      }
    });
  }
}

walk(ROOT);
for (const f of findings) console.log(f);
console.log(`${findings.length} label(s) naming a control without htmlFor or aria-label`);
process.exit(findings.length ? 1 : 0);
