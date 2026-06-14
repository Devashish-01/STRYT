// Single Supabase client for the whole app. ONLY the anon/public key goes
// here — never the service_role key (it bypasses RLS and must stay server-side).
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? "";

// Lazily created so mock mode never needs the env vars set.
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env not set. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env " +
        "(and keep VITE_USE_MOCKS=false to use the real backend)."
    );
  }
  if (!_client) {
    _client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
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
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}
