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

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  getIdToken,
  type Auth,
  type User,
} from "firebase/auth";
import { getSupabase } from "@/lib/supabaseClient";

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
// Internal singletons — lazily initialised so test/mock environments that
// never call any firebase* function pay zero cost.
// ---------------------------------------------------------------------------
let _app:  FirebaseApp | null = null;
let _auth: Auth        | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!_app) _app = getApps().length ? getApp() : initializeApp(cfg);
  return _app;
}

function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(getFirebaseApp());
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
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read-only access to the Firebase currentUser.
 * Returns null when the user is not signed in through Firebase.
 */
export function firebaseCurrentUser(): User | null {
  if (!hasFirebaseWebConfig) return null;
  return getFirebaseAuth().currentUser;
}

/**
 * Build the Google provider with a forced account picker so returning users
 * always choose an account (prevents a different account silently resuming a
 * prior session).
 */
function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
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
  const auth = getFirebaseAuth();

  try {
    const result  = await signInWithPopup(auth, googleProvider());
    const cred    = GoogleAuthProvider.credentialFromResult(result);
    const idToken = cred?.idToken;

    if (!idToken) {
      throw new Error("Google sign-in didn't return a credential. Please try again.");
    }

    // Bridge to Supabase. Firebase session is intentionally kept alive here —
    // see the module-level doc block for why.
    await bridgeToSupabase(idToken);
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
      await signInWithRedirect(auth, googleProvider());
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
export async function firebaseCompleteRedirect(): Promise<boolean> {
  try {
    if (!hasFirebaseWebConfig) return false;
    const result = await getRedirectResult(getFirebaseAuth());
    if (!result) return false;

    const cred    = GoogleAuthProvider.credentialFromResult(result);
    const idToken = cred?.idToken;
    if (!idToken) return false;

    await bridgeToSupabase(idToken);
    return true;
  } catch (e) {
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
    const user = getFirebaseAuth().currentUser;
    if (!user) return false;

    // forceRefresh=true ensures we get a token valid for a full hour, not
    // a cached one that may itself be about to expire.
    const freshIdToken = await getIdToken(user, /* forceRefresh */ true);
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
    const user = getFirebaseAuth().currentUser;
    if (user) await fbSignOut(getFirebaseAuth());
  } catch {
    // Best-effort; Supabase sign-out already happened.
  }
}
