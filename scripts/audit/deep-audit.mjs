// scripts/audit/deep-audit.mjs
import fs from 'fs';

const bodies = JSON.parse(fs.readFileSync('scripts/audit/all_secdef_bodies.json', 'utf8'));
const bodiesMap = new Map();
for (const b of bodies) {
  const sig = `${b.proname}(${b.args || ''})`;
  bodiesMap.set(sig, b);
  bodiesMap.set(b.proname, b); // fallback
}

const csv = fs.readFileSync('docs/security/SECDEF_INVENTORY.csv', 'utf8');
const lines = csv.trim().split('\n');
function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

const headers = parseCSVLine(lines[0]);
const rows = lines.slice(1).map(l => {
  const vals = parseCSVLine(l);
  const obj = {};
  headers.forEach((h, i) => obj[h] = vals[i] || '');
  return obj;
});

const targets = rows.filter(r => r.risk === 'HIGH' || r.risk === 'MEDIUM');

console.log(`Auditing ${targets.length} target functions (44 HIGH, 15 MEDIUM)...`);

const findings = [];

for (const t of targets) {
  const data = bodiesMap.get(t.signature) || bodiesMap.get(t.signature.split('(')[0]);
  if (!data) {
    console.warn(`Could not find body for: ${t.signature}`);
    continue;
  }

  const body = data.body;
  const isTrigger = t.returns === 'trigger' || t.used_by_trigger === 'true';

  findings.push({
    sig: t.signature,
    risk: t.risk,
    returns: t.returns,
    isTrigger,
    appCallers: t.app_callers,
    bodySummary: body.replace(/\s+/g, ' ').slice(0, 300),
    bodyFull: body,
  });
}

// Write out structured inspection file
fs.writeFileSync('scripts/audit/target_functions_audit.json', JSON.stringify(findings, null, 2), 'utf8');
console.log(`Saved structured inspection to scripts/audit/target_functions_audit.json`);
