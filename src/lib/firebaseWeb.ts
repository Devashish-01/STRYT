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
 * Open the Google OAuth popup, bridge the result to Supabase, and keep the
 * Firebase session alive for future silent refreshes.
 *
 * On success, Supabase's onAuthStateChange fires with the new session and the
 * app transitions to authenticated state automatically — the caller does not
 * need to do anything further.
 *
 * Throws a user-visible Error on failure (popup closed, network error, etc.).
 */
export async function firebaseGoogleSignIn(): Promise<void> {
  const auth     = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  // force_select_account so returning users always see the account picker,
  // preventing a different account from silently resuming a prior session.
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(auth, provider);
  const cred   = GoogleAuthProvider.credentialFromResult(result);
  const idToken = cred?.idToken;

  if (!idToken) {
    throw new Error("Google sign-in didn't return a credential. Please try again.");
  }

  // Bridge to Supabase. Firebase session is intentionally kept alive here —
  // see the module-level doc block for why.
  await bridgeToSupabase(idToken);
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
