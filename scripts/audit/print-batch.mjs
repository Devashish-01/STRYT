// scripts/audit/print-batch.mjs
import fs from 'fs';

const batchNum = parseInt(process.argv[2] || '1', 10);
const list = JSON.parse(fs.readFileSync('scripts/audit/target_functions_audit.json', 'utf8'));

let start = 0;
let end = 20;

if (batchNum === 1) {
  start = 0;
  end = 20;
} else if (batchNum === 2) {
  start = 20;
  end = 44;
} else if (batchNum === 3) {
  start = 44;
  end = list.length;
}

console.log(`=== BATCH ${batchNum} (${start + 1} to ${Math.min(end, list.length)} of ${list.length}) ===\n`);

for (let i = start; i < Math.min(end, list.length); i++) {
  const item = list[i];
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`[#${i + 1}] ${item.sig}`);
  console.log(`Risk: ${item.risk} | Returns: ${item.returns} | Trigger: ${item.isTrigger}`);
  console.log(`Callers: ${item.appCallers || 'none'}`);
  console.log(`BODY:\n${item.bodyFull}\n`);
}
