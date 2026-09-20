// Single Supabase client for the whole app. ONLY the publishable/anon key goes here — never the secret
// or service_role key, which bypass RLS and must stay server-side.
//
// Key formats: Supabase is retiring the legacy JWT `anon` key in favour of `sb_publishable_…`, and
// supabase-js accepts either, so the swap is a value change rather than a code change. Both variable
// names are read here — VITE_SUPABASE_PUBLISHABLE_KEY first, then VITE_SUPABASE_ANON_KEY — so the
// rename can happen one environment at a time instead of as a flag day across .env, Vercel, CI and
// every script. `.env.staging` already carries an `sb_publishable_…` value under the old name, which is
// how we know the new format works end to end here.
//
// Once every environment has moved, drop the VITE_SUPABASE_ANON_KEY fallback and the old name with it.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const env = (import.meta as any).env ?? {};
const url = env.VITE_SUPABASE_URL ?? "";
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? "";

// Lazily created so mock mode never needs the env vars set.
let _client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env not set. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY " +
        "(or the legacy VITE_SUPABASE_ANON_KEY) to .env — and keep VITE_USE_MOCKS=false " +
        "to use the real backend."
    );
  }
  if (!_client) {
    _client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE returns an authorization `code` (not a URL fragment) — required
        // for the native deep-link OAuth handoff in nativeAuth.ts, and the
        // modern default on web too (works with detectSessionInUrl).
        flowType: "pkce",
      },
    });
  }
  return _client;
}

export const hasSupabaseEnv = Boolean(url && anonKey);

/**
 * The logged-in user's id (auth uid as text, matching our text PKs).
 * Returns null if not authenticated. Used to stamp owner_user_id on writes
 * and to scope "mine"/"owned" queries.
 */
export async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  // The session this device holds, not a round-trip to /auth/v1/user: getUser() returned null on any network
  // hiccup, so signed-in writes silently took guest/local-only paths (E2E-009: a booking was "confirmed" but
  // never saved), and every screen made dozens of extra auth calls. Access is still decided server-side from the
  // JWT on each request; this id only addresses the caller's own rows.
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}
