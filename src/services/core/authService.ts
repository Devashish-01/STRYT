/**
 * authService.ts
 *
 * Application-level authentication service.
 *
 * Supabase is the single auth + data backend. This service wraps all sign-in
 * methods and exposes a uniform API to the UI layer. Platform-specific details
 * (Firebase popup, Capacitor native picker, Custom Tab) are encapsulated in
 * src/lib/nativeAuth.ts and src/lib/firebaseWeb.ts.
 *
 * Session management principles
 * ─────────────────────────────
 *  • Supabase auto-refreshes its sessions; the custom tokenStore is a shallow
 *    mirror kept so the rest of the codebase (which predates this service) can
 *    read isAuthed synchronously without calling getSession().
 *  • Session healing on expiry is handled entirely in useAuthSession. This file
 *    is only responsible for initiating and terminating sessions.
 *  • Phone numbers are normalised to E.164 (+91XXXXXXXXXX) here so every
 *    method downstream receives a consistent format.
 */

import { tokenStore }  from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";
import { toApiError }  from "@/lib/supabasePage";
import {
  isNativePlatform,
  NATIVE_GOOGLE_SIGNIN_READY,
  nativeGoogleSignInViaFirebase,
  nativeGoogleSignIn,
  hasFirebaseWebConfig,
  firebaseGoogleSignIn,
  firebaseSignOut,
  supabaseOAuthReturnUrl,
} from "@/lib/nativeAuth";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Mirror a Supabase session into the legacy tokenStore so isAuthed guards
 * continue to work synchronously without any callers changing.
 */
function mirrorSession(accessToken?: string | null, refreshToken?: string | null): void {
  if (accessToken && refreshToken) tokenStore.set(accessToken, refreshToken);
}

/**
 * Normalise a user-entered phone string to E.164 (+91XXXXXXXXXX).
 *
 * Supabase / Twilio require E.164. The Supabase test-phone entries use the raw
 * 10-digit form, so we leave 10-digit strings intact — they match the test
 * numbers directly and are rejected by the live provider for real numbers
 * (preventing accidental cross-environment interference).
 */
function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  if (digits.length === 10) return "+91" + digits;
  return input.startsWith("+") ? input : "+" + digits;
}

// ---------------------------------------------------------------------------
// Profile bootstrap
// ---------------------------------------------------------------------------

/**
 * Idempotent upsert that ensures a `public.users` row exists for the signed-in
 * auth user. Must be called after every sign-in path because foreign keys on
 * requests / businesses / providers reject inserts when no matching users row
 * exists. RLS-safe: the row id equals auth.uid().
 */
export async function ensureProfile(
  userId?:   string,
  phone?:    string | null,
  email?:    string | null,
  fullName?: string | null,
): Promise<void> {
  if (!userId) return;
  const sb   = getSupabase();
  const name = fullName || email || phone || "New user";
  const { error } = await sb
    .from("users")
    .upsert(
      { id: userId, name, phone: phone ?? null, email: email ?? null, roles: ["customer"] },
      { onConflict: "id", ignoreDuplicates: true },
    );
  // Don't block login on a profile write hiccup — me() also self-heals on read.
  if (error) console.warn("ensureProfile:", error.message);
}

// ---------------------------------------------------------------------------
// Auth service
// ---------------------------------------------------------------------------

export const authService = {
  // ── Phone OTP ─────────────────────────────────────────────────────────────

  async sendOtp(phone: string) {
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOtp({ phone: normalizePhone(phone) });
    if (error) throw toApiError(error);
    return { ok: true, ttl: 300 };
  },

  async verifyOtp(phoneOrEmail: string, otp: string) {
    const isEmail = phoneOrEmail.includes("@");
    const sb = getSupabase();
    const { data, error } = isEmail
      ? await sb.auth.verifyOtp({ email: phoneOrEmail, token: otp, type: "email" })
      : await sb.auth.verifyOtp({ phone: normalizePhone(phoneOrEmail), token: otp, type: "sms" });
    if (error) throw toApiError(error);
    mirrorSession(data.session?.access_token, data.session?.refresh_token);
    return {
      access_token:  data.session?.access_token  ?? "",
      refresh_token: data.session?.refresh_token ?? "",
      user: data.user,
    };
  },

  // ── Email OTP (magic link) ─────────────────────────────────────────────────

  async sendEmailOtp(email: string) {
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: supabaseOAuthReturnUrl() },
    });
    if (error) throw toApiError(error);
    return { ok: true, ttl: 300 };
  },

  // ── Email + password ───────────────────────────────────────────────────────

  async signInWithPassword(email: string, password: string) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw toApiError(error);
    mirrorSession(data.session?.access_token, data.session?.refresh_token);
    return {
      access_token:  data.session?.access_token  ?? "",
      refresh_token: data.session?.refresh_token ?? "",
      user: data.user,
      hasSession: !!data.session,
    };
  },

  async signUpWithPassword(email: string, password: string) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: supabaseOAuthReturnUrl() },
    });
    if (error) throw toApiError(error);
    mirrorSession(data.session?.access_token, data.session?.refresh_token);
    return {
      access_token:  data.session?.access_token  ?? "",
      refresh_token: data.session?.refresh_token ?? "",
      user: data.user,
      // When email confirmation is required, Supabase returns a user but no
      // session — the caller must prompt the user to check their inbox.
      hasSession: !!data.session,
    };
  },

  // ── Google OAuth ───────────────────────────────────────────────────────────

  /**
   * Sign in with Google. The method is chosen based on platform:
   *
   *  Native + Firebase ready  → Credential Manager (no browser)
   *  Native + no Firebase     → Custom Tab + PKCE deep link
   *  Web   + Firebase config  → Firebase popup → Supabase bridge
   *  Web   + no Firebase      → Supabase's own OAuth redirect (last resort)
   *
   * In all cases, on success, Supabase's onAuthStateChange fires with the new
   * session. The caller does not need to do anything after awaiting this.
   */
  async signInWithGoogle(): Promise<void> {
    if (isNativePlatform()) {
      if (NATIVE_GOOGLE_SIGNIN_READY) await nativeGoogleSignInViaFirebase();
      else                            await nativeGoogleSignIn();
      return;
    }

    if (hasFirebaseWebConfig) {
      await firebaseGoogleSignIn();
      return;
    }

    // Last-resort fallback — requires the Supabase callback URL to be
    // registered in the Google Cloud Console for the Web client.
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options:  { redirectTo: supabaseOAuthReturnUrl() },
    });
    if (error) throw toApiError(error);
  },

  // ── Sign out ───────────────────────────────────────────────────────────────

  /**
   * Sign the user out of all providers.
   *
   * Order matters:
   *  1. Supabase — server-side session invalidation.
   *  2. tokenStore — clears the in-memory + localStorage mirror.
   *  3. Firebase — prevents the stale Google account from appearing on direct
   *     navigation to stryt.in after logout.
   */
  async logout(): Promise<{ ok: true }> {
    const sb = getSupabase();
    // Supabase is the primary session store — sign out here first.
    await sb.auth.signOut();
    // Clear the legacy mirror so synchronous isAuthed reads return false.
    tokenStore.clear();
    // Sign out of Firebase so a stale Google account does not ghost-persist
    // in the browser's IndexedDB and re-appear on the next direct navigation.
    await firebaseSignOut();
    return { ok: true };
  },

  // ── Compatibility shim ────────────────────────────────────────────────────

  /**
   * Legacy refresh method kept for API compatibility with existing callers.
   * Supabase's autoRefreshToken handles this automatically; this is a manual
   * escape hatch for callers that need a synchronous boolean result.
   */
  async refresh(): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await sb.auth.refreshSession();
    if (error || !data.session) {
      tokenStore.clear();
      return false;
    }
    mirrorSession(data.session.access_token, data.session.refresh_token);
    return true;
  },
};
