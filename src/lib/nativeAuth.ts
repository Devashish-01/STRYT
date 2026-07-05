import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { getSupabase } from "@/lib/supabaseClient";

export const isNativePlatform = () => Capacitor.isNativePlatform();

// Flip to true once: (1) a Firebase project exists with an Android app on
// package in.stryt.app, (2) google-services.json is placed at android/app/,
// (3) that Firebase project's auto-generated "Web client" OAuth ID is added
// to Supabase → Authentication → Sign In / Providers → Google → Authorized
// Client IDs (so the ID token's audience is one Supabase accepts), and
// (4) a native rebuild has run (`npx cap sync android` + rebuild — Gradle
// only reads google-services.json at build time). Until then this stays
// false and Google sign-in uses the already-working Custom Tab flow below.
export const NATIVE_GOOGLE_SIGNIN_READY = true;

/**
 * TRUE native Google sign-in (Swiggy/Zomato style): the Android Credential
 * Manager account picker, no browser chrome at all. Uses
 * @capacitor-firebase/authentication purely to drive that native picker and
 * obtain a Google ID token (skipNativeAuth: true in capacitor.config.ts means
 * it does NOT also create a Firebase Auth session) — Supabase remains the
 * one real auth backend via signInWithIdToken.
 */
export async function nativeGoogleSignInViaFirebase(): Promise<void> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error("Google sign-in didn't return a token. Try again.");
  const sb = getSupabase();
  const { error } = await sb.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: result.credential?.nonce,
  });
  if (error) throw error;
}

// The custom-scheme deep link Google/Supabase redirects back to after consent.
// Must be registered BOTH in AndroidManifest (intent-filter) and in the
// Supabase dashboard → Authentication → URL Configuration → Redirect URLs.
export const NATIVE_AUTH_CALLBACK = "in.stryt.app://auth/callback";

/**
 * Custom Tab fallback Google sign-in — used until NATIVE_GOOGLE_SIGNIN_READY.
 *
 * The plain web flow does a full-page redirect to Google and back — inside
 * the Capacitor app that meant the OS browser opened the live website (the
 * bug the user hit). Instead we:
 *   1. Ask Supabase for the provider URL but skip its browser redirect.
 *   2. Open it in an in-app Custom Tab (feels native, shares no session with
 *      the OS browser leaving the app).
 *   3. Catch the `in.stryt.app://auth/callback?code=…` deep link, close the tab,
 *      and exchange the PKCE code for a session in-place — React state is never
 *      torn down, so the app just continues logged in.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: NATIVE_AUTH_CALLBACK,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Couldn't start Google sign-in. Try again.");

  const completed = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

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
      // Give the deep-link handler a beat to win the race; only reject if it
      // hasn't resolved (user genuinely dismissed the tab).
      setTimeout(() => finish(() => reject(new Error("Google sign-in was cancelled."))), 400);
    });
  });

  await Browser.open({ url: data.url, presentationStyle: "popover" });
  await completed;
}
