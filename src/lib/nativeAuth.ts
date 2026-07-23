/**
 * nativeAuth.ts
 *
 * Platform-specific Google sign-in adapters.
 *
 * ┌─────────────────────┬──────────────────────────────────────────────────┐
 * │ Platform            │ Method                                           │
 * ├─────────────────────┼──────────────────────────────────────────────────┤
 * │ Web (Firebase cfg)  │ firebaseGoogleSignIn() — popup via Firebase,     │
 * │                     │ bridges Google id_token → Supabase session       │
 * ├─────────────────────┼──────────────────────────────────────────────────┤
 * │ Web (no Firebase)   │ Supabase's own OAuth redirect (last resort)      │
 * ├─────────────────────┼──────────────────────────────────────────────────┤
 * │ Android (ready)     │ nativeGoogleSignInViaFirebase() — Credential     │
 * │                     │ Manager account picker, no browser chrome        │
 * ├─────────────────────┼──────────────────────────────────────────────────┤
 * │ Android (fallback)  │ nativeGoogleSignIn() — in-app Custom Tab +       │
 * │                     │ deep-link PKCE exchange                          │
 * └─────────────────────┴──────────────────────────────────────────────────┘
 *
 * In all cases Supabase remains the single auth + data backend.
 * Firebase is used only as an OAuth relay.
 */

import { Capacitor } from "@capacitor/core";
import { Browser }   from "@capacitor/browser";
import { App }       from "@capacitor/app";
import { getSupabase }            from "@/lib/supabaseClient";
import { returnTo }               from "@/lib/returnTo";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

// ---------------------------------------------------------------------------
// Feature flag — flip to true once the Firebase Android configuration is in
// place and a native rebuild has been run. See the checklist in GOAL_LIVE.md.
// ---------------------------------------------------------------------------

/**
 * Set to true when:
 *  1. A Firebase project with the Android app (in.stryt.app) exists.
 *  2. google-services.json is at android/app/.
 *  3. The Firebase project's Web-client OAuth ID is registered in Supabase →
 *     Auth → Providers → Google → Authorized Client IDs.
 *  4. `npx cap sync android` + a fresh Gradle build have run.
 */
export const NATIVE_GOOGLE_SIGNIN_READY = true;

// ---------------------------------------------------------------------------
// Deep-link callback registered in AndroidManifest and Supabase redirect URLs.
// ---------------------------------------------------------------------------
export const NATIVE_AUTH_CALLBACK = "in.stryt.app://auth/callback";

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
// Android — Custom Tab fallback (used when NATIVE_GOOGLE_SIGNIN_READY=false)
// ---------------------------------------------------------------------------

/**
 * Custom Tab Google sign-in for Android.
 *
 * A plain web OAuth redirect would cause the OS browser to open the production
 * website (breaking the in-app flow). Instead:
 *  1. Ask Supabase for the provider URL, skipping its own redirect.
 *  2. Open it in an in-app Custom Tab (shares no session with the OS browser).
 *  3. Catch the `in.stryt.app://auth/callback?code=…` deep link, close the
 *     tab, and exchange the PKCE code for a Supabase session — React state is
 *     never torn down, so the app resumes logged in seamlessly.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options:  {
      redirectTo:          NATIVE_AUTH_CALLBACK,
      skipBrowserRedirect: true,
    },
  });
  if (error)     throw error;
  if (!data?.url) throw new Error("Couldn't start Google sign-in. Please try again.");

  const completed = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (!settled) { settled = true; fn(); }
    };

    const listenerPromise = App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith("in.stryt.app://auth")) return;
      try {
        const code = new URL(url).searchParams.get("code");
        if (!code) throw new Error("Google sign-in was cancelled.");
        const { error: exchangeErr } = await sb.auth.exchangeCodeForSession(code);
        if (exchangeErr) throw exchangeErr;
        finish(resolve);
      } catch (e) {
        finish(() => reject(e));
      } finally {
        (await listenerPromise).remove();
        void Browser.close();
      }
    });

    // If the user swipes the Custom Tab away without finishing, don't hang.
    Browser.addListener("browserFinished", () => {
      // Give the deep-link handler a beat to win the race before rejecting.
      setTimeout(
        () => finish(() => reject(new Error("Google sign-in was cancelled."))),
        400,
      );
    });
  });

  await Browser.open({ url: data.url, presentationStyle: "popover" });
  await completed;
}

// ---------------------------------------------------------------------------
// Helpers consumed by authService — re-exported from firebaseWeb so callers
// don't need two imports.
// ---------------------------------------------------------------------------
export {
  hasFirebaseWebConfig,
  firebaseGoogleSignIn,
  firebaseSilentRefresh,
  firebaseSignOut,
} from "@/lib/firebaseWeb";

// ---------------------------------------------------------------------------
// Supabase last-resort redirect (fallback when no Firebase config is present)
// ---------------------------------------------------------------------------
export function supabaseOAuthReturnUrl(): string {
  return window.location.origin + (returnTo.peek() ?? "/home");
}
