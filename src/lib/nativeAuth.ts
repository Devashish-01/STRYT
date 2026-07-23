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
import { returnTo }               from "@/lib/returnTo";

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
} from "@/lib/firebaseWeb";

// ---------------------------------------------------------------------------
// Return path used by Supabase email OTP / magic-link redirects (NOT Google).
// Google sign-in never uses this — it goes through Firebase exclusively.
// ---------------------------------------------------------------------------
export function supabaseOAuthReturnUrl(): string {
  return window.location.origin + (returnTo.peek() ?? "/home");
}
