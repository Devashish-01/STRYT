/**
 * firebaseWeb.ts
 *
 * Web-only Firebase Auth adapter.
 *
 * Role: a thin bridge that drives Google sign-in through Firebase's popup
 * (whose redirect handler is pre-authorized on Firebase's own OAuth client,
 * eliminating redirect_uri_mismatch) and then bridges the resulting Google ID
 * token into a Supabase session. Firebase is never used as a data or primary
 * auth backend — it is purely an OAuth relay.
 *
 * Session lifecycle contract
 * ──────────────────────────
 *  • signIn()          — opens the Google popup, bridges the id_token to Supabase,
 *                        and keeps the Firebase session alive for silent refresh.
 *  • silentRefresh()   — called when the Supabase session expires; asks Firebase
 *                        for a fresh id_token (no popup) and re-bridges it.
 *  • signOut()         — called on explicit user logout; tears down both sessions.
 *  • currentUser       — read-only access to Firebase's currentUser (null when
 *                        not signed in).
 *
 * Keeping Firebase's session alive after signIn() is intentional: the Google
 * id_token that Supabase stores expires after ~1 hour and Supabase cannot
 * refresh it without a live Firebase session to ask for a new one. If Firebase
 * is signed out immediately after bridging, every user is force-logged out
 * hourly (the original bug).
 */

// Types only — erased at build time, so importing them costs nothing at runtime.
import type { FirebaseApp } from "firebase/app";
import type { Auth, GoogleAuthProvider as GoogleAuthProviderType, User } from "firebase/auth";
import { getSupabase } from "@/lib/supabaseClient";
import { completeLoginAcceptance, restoreLoginAcceptance, cancelLoginAcceptance } from "./loginAcceptance";

// ---------------------------------------------------------------------------
// Config — sourced from Vite env. apiKey + authDomain + projectId are all that
// Firebase Auth needs for signInWithPopup. storageBucket / messagingSenderId /
// appId are optional and may be absent (the ANDROID appId is unrelated to this
// web adapter).
// ---------------------------------------------------------------------------
const cfg = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string | undefined,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string | undefined,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string | undefined,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string | undefined,
};

/**
 * True when the three required Firebase Auth env vars are present.
 * Callers use this to decide whether to route through the Firebase bridge
 * or fall back to Supabase's own OAuth redirect.
 */
export const hasFirebaseWebConfig = Boolean(
  cfg.apiKey && cfg.authDomain && cfg.projectId,
);

// ---------------------------------------------------------------------------
// Internal singletons — the SDK itself is fetched on first use, not at import.
// Firebase is only ever needed when someone signs in with Google; loading it
// eagerly put ~218 KB into the first page load for everyone, guests included.
// ---------------------------------------------------------------------------
let _app:  FirebaseApp | null = null;
let _auth: Auth        | null = null;
let _sdk: Promise<{
  app: typeof import("firebase/app");
  auth: typeof import("firebase/auth");
}> | null = null;

function loadSdk() {
  if (!_sdk) {
    _sdk = Promise.all([import("firebase/app"), import("firebase/auth")]).then(([app, auth]) => ({ app, auth }));
  }
  return _sdk;
}

async function getFirebaseApp(): Promise<FirebaseApp> {
  const { app } = await loadSdk();
  if (!_app) _app = app.getApps().length ? app.getApp() : app.initializeApp(cfg);
  return _app;
}

async function getFirebaseAuth(): Promise<Auth> {
  const { auth } = await loadSdk();
  if (!_auth) _auth = auth.getAuth(await getFirebaseApp());
  return _auth;
}

// ---------------------------------------------------------------------------
// Internal helper — bridges a Google id_token into a Supabase session.
// Throws on failure so callers can surface the error to the user.
// ---------------------------------------------------------------------------
async function bridgeToSupabase(idToken: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.signInWithIdToken({ provider: "google", token: idToken });
  if (error) throw error;
  rememberFirebaseBridge(true);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read-only access to the Firebase currentUser.
 * Returns null when the user is not signed in through Firebase.
 */
export async function firebaseCurrentUser(): Promise<User | null> {
  if (!hasFirebaseWebConfig) return null;
  return (await getFirebaseAuth()).currentUser;
}

/**
 * Build the Google provider with a forced account picker so returning users
 * always choose an account (prevents a different account silently resuming a
 * prior session).
 */
async function googleProvider(): Promise<GoogleAuthProviderType> {
  const { auth } = await loadSdk();
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/**
 * Sign in with Google through Firebase and bridge the result to Supabase.
 *
 * Primary path is signInWithPopup. When the popup can't be used — mobile
 * browsers, popup blockers, in-app webviews — we fall back to Firebase's OWN
 * redirect handler (`<authDomain>/__/auth/handler`), which is pre-authorized
 * on Firebase's OAuth client and never touches Supabase's Google client
 * secret. The redirect completes on the next page load via
 * firebaseCompleteRedirect().
 *
 * On the popup path, Supabase's onAuthStateChange fires with the new session
 * and the app transitions to authenticated state automatically. On the
 * redirect path, the function returns after navigation is initiated and the
 * bridge happens after the round-trip.
 *
 * Throws a user-visible Error on genuine failure.
 */
export async function firebaseGoogleSignIn(): Promise<void> {
  const { auth: sdk } = await loadSdk();
  const auth = await getFirebaseAuth();

  try {
    const result  = await sdk.signInWithPopup(auth, await googleProvider());
    const cred    = sdk.GoogleAuthProvider.credentialFromResult(result);
    const idToken = cred?.idToken;

    if (!idToken) {
      throw new Error("Google sign-in didn't return a credential. Please try again.");
    }

    // Bridge to Supabase. Firebase session is intentionally kept alive here —
    // see the module-level doc block for why.
    await bridgeToSupabase(idToken);
    await completeLoginAcceptance();
  } catch (e: unknown) {
    const code = (e as { code?: string } | null)?.code;

    // Popup unavailable / blocked / not supported in this environment →
    // fall back to Firebase's redirect flow. Navigation happens here; the
    // token is bridged after the round-trip via firebaseCompleteRedirect().
    if (
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      await sdk.signInWithRedirect(auth, await googleProvider());
      return;
    }

    // User dismissed the popup themselves — surface a friendly, non-alarming message.
    if (code === "auth/popup-closed-by-user") {
      throw new Error("Sign-in was cancelled.");
    }

    throw e;
  }
}

/**
 * Complete a Google sign-in that used the redirect fallback.
 *
 * Call this once on app bootstrap. If the current page load is the return leg
 * of a signInWithRedirect(), this consumes the pending credential and bridges
 * the Google id_token into a Supabase session. If there is no pending redirect,
 * it resolves to false immediately (cheap no-op).
 *
 * Never throws — a failed redirect completion must not block app startup.
 */
/**
 * Is a Firebase redirect sign-in waiting to be consumed on this page load?
 *
 * Firebase parks a `firebase:pendingRedirect:*` marker in sessionStorage when it sends the user to Google, and only
 * a load that follows that redirect can have one. Checking it costs nothing, and skipping the SDK download for
 * everyone else keeps ~260 KB out of the first load of every page (P11.B).
 */
const BRIDGED_KEY = "stryt_firebase_bridged";

/**
 * Has this device ever signed in through the Firebase bridge?
 *
 * Only then can a silent refresh find a Firebase session to re-bridge. Without this, every reload by every
 * signed-out visitor downloaded the SDK to ask a question whose answer was always no (P11.B).
 */
export function hasUsedFirebaseSignIn(): boolean {
  if (typeof window === "undefined" || !hasFirebaseWebConfig) return false;
  try {
    return localStorage.getItem(BRIDGED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberFirebaseBridge(used: boolean): void {
  try {
    if (used) localStorage.setItem(BRIDGED_KEY, "1");
    else localStorage.removeItem(BRIDGED_KEY);
  } catch {
    // Storage blocked: the silent-refresh path is an optimisation, not a requirement.
  }
}

export function hasPendingFirebaseRedirect(): boolean {
  if (typeof window === "undefined" || !hasFirebaseWebConfig) return false;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("firebase:pendingRedirect")) return true;
    }
  } catch {
    // Private mode or blocked storage: assume nothing is pending. A redirect sign-in couldn't have stored its
    // marker either, so there is nothing to consume.
  }
  return false;
}

export async function firebaseCompleteRedirect(): Promise<boolean> {
  try {
    if (!hasFirebaseWebConfig) return false;
    if (!hasPendingFirebaseRedirect()) return false;
    restoreLoginAcceptance();
    const { auth: sdk } = await loadSdk();
    const result = await sdk.getRedirectResult(await getFirebaseAuth());
    if (!result) { cancelLoginAcceptance(); return false; }

    const cred    = sdk.GoogleAuthProvider.credentialFromResult(result);
    const idToken = cred?.idToken;
    if (!idToken) { cancelLoginAcceptance(); return false; }

    await bridgeToSupabase(idToken);
    await completeLoginAcceptance();
    return true;
  } catch (e) {
    cancelLoginAcceptance();
    console.warn("[auth] Firebase redirect completion failed:", e);
    return false;
  }
}

/**
 * Silently re-bridge the current Firebase session to Supabase without showing
 * a popup. Call this when Supabase's own session refresh fails (which happens
 * after ~1 hour for id_token-bridged sessions because Supabase has no refresh
 * token chain for them).
 *
 * Returns true if the session was successfully refreshed, false otherwise.
 * Never throws.
 */
export async function firebaseSilentRefresh(): Promise<boolean> {
  try {
    if (!hasFirebaseWebConfig || !hasUsedFirebaseSignIn()) return false;
    const { auth: sdk } = await loadSdk();
    const user = (await getFirebaseAuth()).currentUser;
    if (!user) return false;

    // forceRefresh=true ensures we get a token valid for a full hour, not
    // a cached one that may itself be about to expire.
    const freshIdToken = await sdk.getIdToken(user, /* forceRefresh */ true);
    await bridgeToSupabase(freshIdToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sign the user out of Firebase. Call this on explicit user logout to prevent
 * a stale Firebase account from appearing on direct navigation to the site.
 * Never throws.
 */
export async function firebaseSignOut(): Promise<void> {
  try {
    if (!hasFirebaseWebConfig) return;
    const { auth: sdk } = await loadSdk();
    const auth = await getFirebaseAuth();
    if (auth.currentUser) await sdk.signOut(auth);
    rememberFirebaseBridge(false);
  } catch {
    // Best-effort; Supabase sign-out already happened.
  }
}
