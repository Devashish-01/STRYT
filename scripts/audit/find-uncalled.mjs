import fs from 'fs';

const csv = fs.readFileSync('docs/security/SECDEF_INVENTORY.csv', 'utf8');
const lines = csv.trim().split('\n');

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else { cur += ch; }
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

const uncalled = rows.filter(r => 
  !r.app_callers && 
  !r.edge_callers && 
  (r.used_by_policy === 'false' || !r.used_by_policy) && 
  (r.used_by_trigger === 'false' || !r.used_by_trigger) && 
  (r.used_by_cron === 'false' || !r.used_by_cron) &&
  r.auth_exec === 'true'
);

console.log(`Uncalled functions with auth_exec=true: ${uncalled.length}`);
for (const u of uncalled) {
  console.log(` - ${u.signature}`);
}
