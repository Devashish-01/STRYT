import fs from 'fs';
import path from 'path';

function splitArgs(argStr) {
  if (!argStr || !argStr.trim()) return [];
  const args = [];
  let depth = 0;
  let current = "";
  for (const ch of argStr) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// Extract types from argument string (e.g. "p_id text, p_num numeric(10,2) default 0" -> "text, numeric(10,2)")
function normalizeArgTypes(argStr) {
  const parts = splitArgs(argStr);
  const types = parts.map(p => {
    // strip default ...
    let s = p.replace(/\s+default\s+[\s\S]*$/i, '').trim();
    // remove parameter mode if present at start (in, out, inout, variadic)
    s = s.replace(/^(?:in|out|inout|variadic)\s+/i, '').trim();
    // In postgres argument declaration: "[param_name] type" or just "type"
    // Split by whitespace
    const tokens = s.split(/\s+/);
    if (tokens.length === 1) {
      return tokens[0].toLowerCase();
    }
    // If multiple tokens: last tokens might be "double precision" or "timestamp with time zone"
    // usually param name is tokens[0]
    return tokens.slice(1).join(' ').toLowerCase();
  });
  return types.join(', ');
}

console.log("Empty:", normalizeArgTypes(""));
console.log("p_user_id text:", normalizeArgTypes("p_user_id text"));
console.log("p_token_code text, p_business_id text:", normalizeArgTypes("p_token_code text, p_business_id text"));
console.log("in_lng double precision, in_lat double precision:", normalizeArgTypes("in_lng double precision, in_lat double precision"));
console.log("p_amount numeric(10, 2) default 0:", normalizeArgTypes("p_amount numeric(10, 2) default 0"));
