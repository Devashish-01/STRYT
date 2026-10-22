/**
 * nativeAuth.ts
 *
 * Platform-specific Google sign-in adapters. Firebase is the ONLY identity
 * provider on every platform:
 *
 * ┌─────────────┬────────────────────────────────────────────────────────────┐
 * │ Platform    │ Method                                                     │
 * ├─────────────┼────────────────────────────────────────────────────────────┤
 * │ Web         │ firebaseGoogleSignIn() — Firebase popup (with automatic     │
 * │             │ fallback to Firebase's own redirect handler)                │
 * ├─────────────┼────────────────────────────────────────────────────────────┤
 * │ Android     │ nativeGoogleSignInViaFirebase() — Firebase Credential       │
 * │             │ Manager account picker, no browser chrome                   │
 * └─────────────┴────────────────────────────────────────────────────────────┘
 *
 * Both paths obtain a Google ID token from Firebase and bridge it into a
 * Supabase session via signInWithIdToken. Supabase's own signInWithOAuth
 * redirect flow is intentionally NOT used — it depends on the Google client
 * secret stored in the Supabase dashboard and fails with "invalid_client"
 * when that secret is stale.
 */

import { Capacitor } from "@capacitor/core";
import { getSupabase }            from "@/lib/supabaseClient";
import { completeLoginAcceptance } from "./loginAcceptance";
import { OtpError } from "./authErrors";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

// ---------------------------------------------------------------------------
// Android — native Credential Manager (no browser chrome)
// ---------------------------------------------------------------------------

/**
 * Native Google sign-in via the Android Credential Manager account picker.
 *
 * Uses @capacitor-firebase/authentication to obtain a Google ID token from
 * the native credential store, then bridges it to a Supabase session.
 * `skipNativeAuth: true` in capacitor.config.ts ensures this plugin does NOT
 * also create a Firebase Auth session — Supabase is the one real backend.
 */
export async function nativeGoogleSignInViaFirebase(): Promise<void> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  const result  = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;

  if (!idToken) {
    throw new Error("Google sign-in didn't return a token. Please try again.");
  }

  const sb = getSupabase();
  const { error } = await sb.auth.signInWithIdToken({
    provider: "google",
    token:    idToken,
    nonce:    result.credential?.nonce,
  });
  if (error) throw error;
  await completeLoginAcceptance();
}

// ---------------------------------------------------------------------------
// Native Android Phone OTP via @capacitor-firebase/authentication
// ---------------------------------------------------------------------------

let _nativeVerificationId: string | null = null;
let _nativeAutoVerified = false;
let _completedHandle: { remove: () => Promise<void> } | null = null;
const _autoVerifyListeners = new Set<() => void>();

const VERIFICATION_TTL_MS = 10 * 60 * 1000;

function clearNativeVerification(): void {
  _nativeVerificationId = null;
  _nativeAutoVerified = false;
  try {
    sessionStorage.removeItem("native_verification_id");
    sessionStorage.removeItem("native_verification_at");
  } catch {}
}

async function dropCompletedListener(): Promise<void> {
  try { await _completedHandle?.remove(); } catch {}
  _completedHandle = null;
}

/**
 * Android can verify a number WITHOUT the user typing a code: instant verification (Google already trusts
 * this SIM) or SMS auto-retrieval. Either way Firebase signs the user in natively and fires
 * `phoneVerificationCompleted`; `phoneCodeSent` may never fire. OtpVerify subscribes here so it can finish
 * the sign-in as soon as that happens, instead of waiting on a code box the user never needs to fill.
 */
export function onNativeAutoVerified(cb: () => void): () => void {
  _autoVerifyListeners.add(cb);
  return () => { _autoVerifyListeners.delete(cb); };
}

export const nativeWasAutoVerified = (): boolean => _nativeAutoVerified;

/** True while a code can still be confirmed (or the number was already auto-verified). Survives a WebView reload. */
export const nativeHasPendingVerification = (): boolean => _nativeAutoVerified || storedVerificationId() !== null;

export interface NativeSendResult { autoVerified: boolean }

export async function nativeSendPhoneOtp(phoneNumber: string, opts: { resend?: boolean } = {}): Promise<NativeSendResult> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  clearNativeVerification();
  await dropCompletedListener();

  let resolveOutcome!: (r: NativeSendResult) => void;
  let rejectOutcome!: (e: unknown) => void;
  const outcome = new Promise<NativeSendResult>((res, rej) => { resolveOutcome = res; rejectOutcome = rej; });

  let settled = false;
  const oneShot: Array<{ remove: () => Promise<void> }> = [];
  const cleanup = async () => {
    for (const h of oneShot) { try { await h.remove(); } catch {} }
  };
  // Runs `finish` at most once, after the one-shot listeners are gone.
  const settle = async (finish: () => void) => {
    if (settled) return;
    settled = true;
    await cleanup();
    finish();
  };

  // Stays registered after this promise settles: auto-retrieval usually completes seconds AFTER the code
  // was sent, while the user is on the code screen. Removed on the next send / successful verify.
  _completedHandle = await FirebaseAuthentication.addListener("phoneVerificationCompleted", () => {
    _nativeAutoVerified = true;
    _autoVerifyListeners.forEach((cb) => { try { cb(); } catch {} });
    void settle(() => resolveOutcome({ autoVerified: true }));
  });

  oneShot.push(await FirebaseAuthentication.addListener("phoneCodeSent", (event) => {
    _nativeVerificationId = event.verificationId;
    try {
      sessionStorage.setItem("native_verification_id", event.verificationId);
      sessionStorage.setItem("native_verification_at", String(Date.now()));
    } catch {}
    void settle(() => resolveOutcome({ autoVerified: false }));
  }));

  oneShot.push(await FirebaseAuthentication.addListener("phoneVerificationFailed", (event) => {
    void settle(async () => {
      await dropCompletedListener();
      rejectOutcome(Object.assign(new Error(event.message || "Phone verification failed"), { code: (event as { code?: string }).code }));
    });
  }));

  try {
    await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber, resendCode: opts.resend === true });
  } catch (e) {
    await settle(() => rejectOutcome(e));
    await dropCompletedListener();
  }

  return outcome;
}

function storedVerificationId(): string | null {
  if (_nativeVerificationId) return _nativeVerificationId;
  try {
    const at = Number(sessionStorage.getItem("native_verification_at") ?? 0);
    if (at && Date.now() - at > VERIFICATION_TTL_MS) { clearNativeVerification(); return null; }
    return sessionStorage.getItem("native_verification_id");
  } catch {
    return null;
  }
}

/**
 * Returns a fresh Firebase ID token for the phone sign-in.
 *  - With a typed `code`: confirms it, then reads the token.
 *  - With no code and instant/auto verification already done: just reads the token.
 */
export async function nativeVerifyPhoneOtp(code: string | null): Promise<{ idToken: string }> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");

  if (code === null) {
    if (!_nativeAutoVerified) throw new Error("No native verification request found. Please request a new OTP.");
  } else {
    const verificationId = storedVerificationId();
    if (!verificationId) {
      throw new Error("No native verification request found. Please request a new OTP.");
    }
    await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code });
  }

  // After a confirmed code the plugin has a native Firebase session to read the token from. An APK built before
  // skipNativeAuth was switched off has none, and OTA only updates JS, so the old native shell can send the SMS
  // and accept the code but never produce a token. Say so plainly instead of a generic failure.
  let token: string | undefined;
  try {
    token = (await FirebaseAuthentication.getIdToken({ forceRefresh: true })).token;
  } catch { /* handled below */ }
  if (!token) throw new OtpError("otp_err_update_app");
  return { idToken: token };
}

/**
 * Called once the Supabase session exists. Firebase's job (proving the phone) is over; its own session would
 * only linger on the device, so drop it along with the stale verification state.
 */
export async function nativeFinishPhoneSignIn(): Promise<void> {
  clearNativeVerification();
  await dropCompletedListener();
  try {
    const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
    await FirebaseAuthentication.signOut();
  } catch {
    // Best-effort.
  }
}

/**
 * Native Firebase sign-out. With skipNativeAuth=false the plugin keeps its own Firebase session (Google and
 * phone alike); firebaseSignOut() only knows about the web SDK, so without this the picker would silently
 * reuse the previous Google account after logout.
 */
export async function nativeSignOut(): Promise<void> {
  if (!isNativePlatform()) return;
  clearNativeVerification();
  await dropCompletedListener();
  try {
    const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
    await FirebaseAuthentication.signOut();
  } catch {
    // Best-effort; the Supabase session is already gone.
  }
}

// ---------------------------------------------------------------------------
// Helpers consumed by authService — re-exported from firebaseWeb so callers
// don't need two imports.
// ---------------------------------------------------------------------------
export {
  hasFirebaseWebConfig,
  firebaseGoogleSignIn,
  firebaseCompleteRedirect,
  firebaseSilentRefresh,
  firebaseSignOut,
  firebaseSendPhoneOtp,
  firebaseVerifyPhoneOtp,
  firebaseFinishPhoneSignIn,
  hasPendingPhoneVerification,
} from "@/lib/firebaseWeb";
