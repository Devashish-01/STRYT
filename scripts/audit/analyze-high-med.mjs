import fs from 'fs';
import path from 'path';

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

const high = rows.filter(r => r.risk === 'HIGH');
const med = rows.filter(r => r.risk === 'MEDIUM');

console.log(`=== HIGH RISK FUNCTIONS (${high.length}) ===`);
for (const r of high) {
  console.log(`${r.signature} | ret: ${r.returns} | trig: ${r.used_by_trigger} | callers: ${r.app_callers || 'none'}`);
}

console.log(`\n=== MEDIUM RISK FUNCTIONS (${med.length}) ===`);
for (const r of med) {
  console.log(`${r.signature} | ret: ${r.returns} | trig: ${r.used_by_trigger} | callers: ${r.app_callers || 'none'}`);
}
