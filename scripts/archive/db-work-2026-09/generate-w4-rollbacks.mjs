import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const snapPath = path.join(ROOT, "supabase/snapshots/2026-09-13_after_20260958.sql");
const snap = fs.readFileSync(snapPath, "utf8");

function extractFunction(name) {
  const startStr = "CREATE OR REPLACE FUNCTION public." + name;
  const start = snap.indexOf(startStr);
  if (start === -1) throw new Error("Function not found: " + name);
  const endMarker = "$function$\n;";
  const end = snap.indexOf(endMarker, start);
  if (end === -1) throw new Error("End marker not found for: " + name);
  return snap.substring(start, end + endMarker.length);
}

// 1. Rollback for 20260935
const rescheduleDef = extractFunction("reschedule_appointment");
const rb35Content = `-- Rollback for 20260935_reschedule_preserve_payment_and_package.sql
-- Restores live reschedule_appointment definition from snapshot 2026-09-13_after_20260958.sql

${rescheduleDef}

revoke all on function public.reschedule_appointment(text, timestamptz, text, text, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.reschedule_appointment(p_original_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_notes text, p_photo_url text, p_package_id text, p_package_name text, p_package_price numeric) to authenticated, postgres, service_role;
`;

const rb35Path = path.join(ROOT, "supabase/rollbacks/20260935_reschedule_preserve_payment_and_package.rollback.sql");
fs.writeFileSync(rb35Path, rb35Content, "utf8");
console.log(`Written 20260935 rollback (${rb35Content.length} bytes) to ${rb35Path}`);

// 2. Rollback for 20260897
const limitDef = extractFunction("enforce_customer_daily_appointment_limit");
const rb97Content = `-- Rollback for 20260897_daily_limit_advisory_lock.sql
-- Restores live enforce_customer_daily_appointment_limit definition from snapshot 2026-09-13_after_20260958.sql

${limitDef}

revoke all on function public.enforce_customer_daily_appointment_limit() from public, anon, authenticated;
grant execute on function public.enforce_customer_daily_appointment_limit() to postgres, service_role;
`;

const rb97Path = path.join(ROOT, "supabase/rollbacks/20260897_daily_limit_advisory_lock.rollback.sql");
fs.writeFileSync(rb97Path, rb97Content, "utf8");
console.log(`Written 20260897 rollback (${rb97Content.length} bytes) to ${rb97Path}`);
