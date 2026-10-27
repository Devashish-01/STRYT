/**
 * authService.ts
 *
 * Application-level authentication service.
 *
 * Two ways in, both proven by Firebase and both ending in a Supabase session:
 *   • Google        — Firebase returns a Google ID token → supabase.auth.signInWithIdToken.
 *   • Phone (SMS)   — Firebase verifies the OTP → edge function `firebase-phone-auth` mints the session.
 * (Email + password exists only for staff on /admin/login.) Supabase is the single data backend; it never
 * sends an SMS or an email for sign-in. Platform details (Firebase popup, Capacitor native picker) live in
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
import { beginLoginAcceptance, cancelLoginAcceptance } from "@/lib/loginAcceptance";
import { OtpError, otpErrorKey, providerErrorLabel } from "@/lib/authErrors";
import { canSendOtp, recordOtpSent } from "@/lib/otpThrottle";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { EVENTS, resetAnalyticsSession, track } from "@/lib/analytics";
import {
  isNativePlatform,
  nativeGoogleSignInViaFirebase,
  nativeSendPhoneOtp,
  nativeVerifyPhoneOtp,
  nativeFinishPhoneSignIn,
  nativeSignOut,
  hasFirebaseWebConfig,
  firebaseGoogleSignIn,
  firebaseSignOut,
  firebaseSendPhoneOtp,
  firebaseVerifyPhoneOtp,
  firebaseFinishPhoneSignIn,
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
 * supabase-js hides the edge function's JSON body behind a generic "non-2xx" error: on HTTP failures the real
 * response is on `error.context`. Read it so a 429 shows "too many attempts" rather than "Edge Function
 * returned a non-2xx status code" (and so a network drop is told apart from a server fault).
 */
async function edgeFailure(edgeErr: unknown, edgeData: { code?: string; message?: string } | null): Promise<OtpError> {
  const ctx = (edgeErr as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = (await (ctx as Response).clone().json()) as { code?: string } | null;
      return new OtpError(otpErrorKey({ code: body?.code }), undefined, { cause: edgeErr });
    } catch { /* body wasn't JSON — fall through */ }
  }
  if (edgeData?.code) return new OtpError(otpErrorKey({ code: edgeData.code }), undefined, { cause: edgeErr });
  if ((edgeErr as { name?: string } | null)?.name === "FunctionsFetchError") {
    return new OtpError("otp_err_network", undefined, { cause: edgeErr });
  }
  return new OtpError("otp_err_generic", undefined, { cause: edgeErr });
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
  // Never seed a contact detail as the display name (20260876): "New user" prompts for a real one.
  const name = fullName || "New user";
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
  // ── Phone OTP (Firebase SMS → Supabase session) ────────────────────────────

  /**
   * Sends the SMS code. `autoVerified` is true only on Android when Google verified the SIM instantly or
   * the SMS was auto-read — the caller should then skip the code screen and call verifyOtp(phone, null).
   * Throws OtpError (i18n key + params); raw provider text never reaches the UI.
   */
  async sendOtp(phone: string, opts: { resend?: boolean } = {}) {
    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) throw new OtpError("otp_err_invalid_phone");

    const gate = canSendOtp(normalized);
    if (!gate.ok) {
      throw gate.reason === "limit"
        ? new OtpError("otp_send_limit")
        : new OtpError("otp_cooldown_wait", { n: gate.seconds });
    }

    try {
      let autoVerified = false;
      if (isNativePlatform()) {
        autoVerified = (await nativeSendPhoneOtp(normalized, opts)).autoVerified;
      } else {
        if (!hasFirebaseWebConfig) {
          throw new Error("Phone sign-in is unavailable — Firebase is not configured for this build.");
        }
        await firebaseSendPhoneOtp(normalized);
      }
      recordOtpSent(normalized);
      track(EVENTS.OTP_SENT, { is_native: isNativePlatform(), is_resend: opts.resend === true });
      return { ok: true, ttl: 300, autoVerified };
    } catch (e) {
      console.warn("sendOtp failed:", e);
      const key = otpErrorKey(e);
      track(EVENTS.OTP_FAILED, { step: "send", error_code: key, provider_error_code: providerErrorLabel(e), is_native: isNativePlatform() });
      throw new OtpError(key, undefined, { cause: e });
    }
  },

  /**
   * `otp` is the typed 6-digit code, or null when Android already verified the number without one
   * (see sendOtp → autoVerified).
   */
  async verifyOtp(rawPhone: string, otp: string | null) {
    const sb = getSupabase();

    // ── Phone OTP via Firebase ───────────────────────────────────────────────
    const phone = normalizePhone(rawPhone);

    let idToken: string;
    try {
      ({ idToken } = isNativePlatform()
        ? await nativeVerifyPhoneOtp(otp)
        : await firebaseVerifyPhoneOtp(otp ?? ""));
    } catch (e) {
      console.warn("verifyOtp (firebase) failed:", e);
      const key = otpErrorKey(e);
      track(EVENTS.OTP_FAILED, { step: "verify", error_code: key, provider_error_code: providerErrorLabel(e), is_native: isNativePlatform() });
      throw new OtpError(key, undefined, { cause: e });
    }
    if (!idToken) throw new OtpError("otp_err_generic");

    // Bridge the Firebase ID token to a Supabase session via the edge function.
    const { data: edgeData, error: edgeErr } = await sb.functions.invoke("firebase-phone-auth", {
      body: { idToken },
    });
    if (edgeErr || !edgeData?.session) {
      const failure = await edgeFailure(edgeErr, edgeData);
      track(EVENTS.OTP_FAILED, { step: "bridge", error_code: failure.key });
      throw failure;
    }

    const session = edgeData.session;
    const { error: sessionError } = await sb.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (sessionError) {
      console.warn("verifyOtp (setSession) failed:", sessionError);
      track(EVENTS.OTP_FAILED, { step: "session", error_code: "otp_err_generic" });
      throw new OtpError("otp_err_generic", undefined, { cause: sessionError });
    }

    mirrorSession(session.access_token, session.refresh_token);

    const user = edgeData.user || session.user;
    if (user?.id) {
      await ensureProfile(user.id, phone, null, null);
    }

    track(EVENTS.OTP_VERIFIED, { is_native: isNativePlatform(), is_auto_verified: otp === null });

    // Firebase proved the number; its own session is no longer needed on the device.
    void (isNativePlatform() ? nativeFinishPhoneSignIn() : firebaseFinishPhoneSignIn());

    return {
      access_token:  session.access_token  ?? "",
      refresh_token: session.refresh_token ?? "",
      user,
    };
  },

  // ── Email + password — staff only (/admin/login) ───────────────────────────
  // Customers never use this: they sign in with Google or a phone OTP.

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

  // ── Google OAuth ───────────────────────────────────────────────────────────

  /**
   * Sign in with Google — Firebase is the ONLY identity provider.
   *
   *  Native  → Firebase Credential Manager account picker (no browser chrome)
   *  Web     → Firebase popup, with automatic fallback to Firebase's own
   *            redirect handler when a popup can't be shown
   *
   * Both paths obtain a Google ID token from Firebase and bridge it into a
   * Supabase session via signInWithIdToken — which validates the token against
   * the authorized client IDs and does NOT use Supabase's Google OAuth client
   * secret. This deliberately avoids Supabase's signInWithOAuth redirect flow
   * (the /authorize → /callback path), which fails with "invalid_client" when
   * the dashboard client secret is stale.
   *
   * On success, Supabase's onAuthStateChange fires with the new session (popup
   * path) or the session lands after the redirect round-trip. The caller does
   * not need to do anything after awaiting this.
   */
  async signInWithGoogle(): Promise<void> {
    beginLoginAcceptance();
    try {
    if (isNativePlatform()) {
      await nativeGoogleSignInViaFirebase();
      return;
    }

    if (!hasFirebaseWebConfig) {
      throw new Error(
        "Google sign-in is unavailable — Firebase is not configured for this build.",
      );
    }

    await firebaseGoogleSignIn();
    } catch (error) {
      cancelLoginAcceptance();
      throw error;
    }
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
    // First, before any await: the next person on this device must not inherit this analytics session.
    resetAnalyticsSession();
    const sb = getSupabase();
    // Supabase is the primary session store — sign out here first.
    await sb.auth.signOut();
    // Clear the legacy mirror so synchronous isAuthed reads return false.
    tokenStore.clear();
    // Sign out of Firebase so a stale Google account does not ghost-persist
    // in the browser's IndexedDB and re-appear on the next direct navigation.
    await firebaseSignOut();
    // Native: the plugin keeps its own Firebase session (skipNativeAuth=false) that the web SDK call can't reach.
    await nativeSignOut();
    return { ok: true };
  },
};
