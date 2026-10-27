/**
 * purge-expired-stories
 *
 * Daily storage sweep behind the "stories are removed after they expire" promise (Data Retention Policy, Terms §18.6).
 *
 * The database half is `purge_expired_stories()` (pg_cron, 03:17 UTC): it deletes expired story rows, which also
 * deletes their view/reaction rows. A story's photo lives in storage and is not touched by that, so this function
 * removes every story photo no story row points at any more — expired stories, stories their author deleted
 * without the app reaching storage, and uploads whose post never finished. Highlights are still referenced by
 * their row, so they stay.
 *
 * Auth: the project's secret API key only (the daily GitHub workflow). verify_jwt is false — secret keys aren't JWTs —
 * so the key is compared exactly, never decoded. Same contract as purge-deleted-accounts.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "uploads";
const BATCH = 500;
const MAX_BATCHES = 10; // 5,000 photos a run is far beyond real volume; the next run continues.

function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys?.default) return keys.default as string;
  } catch { /* malformed or absent -- fall through to the legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function isServiceCaller(req: Request): boolean {
  const expected = secretKey();
  if (!expected) return false;
  const apikey = req.headers.get("apikey") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return apikey === expected || bearer === expected;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!isServiceCaller(req)) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Rows first, so the photos of everything that expired today are already unreferenced when we look.
  const { data: rowsDeleted, error: rowErr } = await sb.rpc("purge_expired_stories");
  if (rowErr) return json({ error: `purge_expired_stories failed: ${rowErr.message}` }, 500);

  let photosRemoved = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await sb.rpc("orphan_story_files", { p_limit: BATCH });
    if (error) return json({ error: `orphan_story_files failed: ${error.message}`, rowsDeleted, photosRemoved }, 500);
    const names = ((data ?? []) as { name: string }[]).map((r) => r.name).filter(Boolean);
    if (names.length === 0) break;
    const { error: rmErr } = await sb.storage.from(BUCKET).remove(names);
    if (rmErr) return json({ error: `storage remove failed: ${rmErr.message}`, rowsDeleted, photosRemoved }, 500);
    photosRemoved += names.length;
    if (names.length < BATCH) break;
  }

  return json({ ok: true, rowsDeleted, photosRemoved });
});
