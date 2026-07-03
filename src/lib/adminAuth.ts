import { getSupabase } from "@/lib/supabaseClient";

/** Resolves an admin login ID to its underlying auth email. Never reveals
 *  whether the ID exists — an unmatched ID just resolves to null, same as
 *  a wrong password, so the caller can show one generic "invalid" error. */
export async function resolveAdminEmail(loginId: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("resolve_admin_email", { p_login_id: loginId.trim().toLowerCase() });
  if (error) return null;
  return (data as string | null) ?? null;
}
