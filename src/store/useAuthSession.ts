/**
 * useAuthSession.ts
 *
 * Single source of truth for the app's authentication state.
 *
 * Responsibilities
 * ────────────────
 *  • Bootstrap  — resolve the initial Supabase session on mount, then signal
 *                 authReady so the route guard can proceed.
 *  • Sync       — mirror every Supabase auth event (SIGNED_IN, TOKEN_REFRESHED,
 *                 SIGNED_OUT) into React state and the legacy tokenStore.
 *  • Realtime   — keep the Supabase Realtime socket's JWT in sync with the
 *                 current session so RLS-protected channels never go silent.
 *  • Healing    — when the Supabase session expires (common for Firebase-bridged
 *                 Google sessions, which lack a server-side refresh chain), try
 *                 a silent Firebase re-auth before accepting the sign-out.
 *  • Foreground — on tab/app resume, proactively refresh the session before any
 *                 API call fires so expired tokens don't cascade into 401s.
 *
 * What this hook does NOT do
 * ──────────────────────────
 *  • It never navigates. Routing is the caller's responsibility.
 *  • It never shows UI. Errors are surfaced through authReady + isAuthed.
 *  • It never clears tokens on a network error. Only a confirmed SIGNED_OUT
 *    event from Supabase is authoritative.
 */

import { useEffect, useState } from "react";
import { tokenStore }          from "@/lib/auth";
import { getSupabase }         from "@/lib/supabaseClient";
import {
  hasFirebaseWebConfig,
  firebaseSilentRefresh,
} from "@/lib/firebaseWeb";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum time to wait for the initial getSession() call before marking auth
 * as ready. Prevents the splash from hanging forever on a flaky network.
 */
const AUTH_READY_TIMEOUT_MS = 6_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuthSession() {
  const [isAuthed,  setIsAuthed]  = useState<boolean>(tokenStore.isAuthed);
  /**
   * False until the first Supabase session check resolves.
   * The route guard waits on this flag so OAuth / magic-link redirects
   * (which carry ?code= and are exchanged for a session asynchronously) are
   * never bounced to the login screen mid-callback.
   */
  const [authReady, setAuthReady] = useState<boolean>(false);

  useEffect(() => {
    // ── 1. Get the Supabase client ────────────────────────────────────────────
    let sb: ReturnType<typeof getSupabase>;
    try {
      sb = getSupabase();
    } catch (e) {
      // Supabase env vars are missing (e.g. running without .env).
      // Fall through to the login screen immediately.
      console.error("[auth] Supabase init failed:", e);
      setAuthReady(true);
      return;
    }

    // ── 2. Bootstrap safety net ───────────────────────────────────────────────
    // If getSession() stalls (e.g. Supabase is temporarily unreachable), mark
    // auth ready after a timeout so the user isn't trapped on the splash screen.
    const readyTimer = setTimeout(() => {
      console.warn("[auth] getSession() timed out — marking authReady to unblock routing.");
      setAuthReady(true);
    }, AUTH_READY_TIMEOUT_MS);

    // ── 3. Resolve the initial session ────────────────────────────────────────
    // With detectSessionInUrl=true, Supabase awaits the ?code= PKCE exchange
    // before getSession() resolves, so by this point we have a definitive answer.
    void sb.auth.getSession().then(({ data }) => {
      if (data.session) {
        tokenStore.set(data.session.access_token, data.session.refresh_token);
        // Hand the JWT to the Realtime socket. Without this, Realtime treats the
        // connection as `anon` and RLS-protected tables silently deliver no rows.
        sb.realtime.setAuth(data.session.access_token);
        setIsAuthed(true);
      } else {
        // Do NOT call tokenStore.clear() here. getSession() returns null when the
        // network is unavailable during startup (Supabase can't refresh an expired
        // token). Clearing here would turn a transient network hiccup into a
        // permanent logout. The onAuthStateChange SIGNED_OUT event (below) is the
        // correct and authoritative path for credential clearing.
        setIsAuthed(false);
      }
    }).catch((e) => {
      // Network error — leave stored tokens intact. The user stays in an
      // optimistically-authenticated state; the session will re-validate on the
      // next successful network request or foreground resume.
      console.warn("[auth] getSession() failed (network?), keeping stored session:", e);
    }).finally(() => {
      clearTimeout(readyTimer);
      setAuthReady(true);
    });

    // ── 4. Subscribe to auth state changes ────────────────────────────────────
    const { data: { subscription } } = sb.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          // Any sign-in or silent token refresh — keep everything in sync.
          tokenStore.set(session.access_token, session.refresh_token);
          sb.realtime.setAuth(session.access_token);
          setIsAuthed(true);

        } else if (event === "SIGNED_OUT") {
          // Before accepting the sign-out, attempt to heal the session silently.
          //
          // Why: Supabase sessions created via signInWithIdToken (the Firebase
          // → Supabase bridge) expire after ~1 hour. Supabase has no server-side
          // refresh token for them (there is no refresh_token in the grant), so
          // it fires SIGNED_OUT when the access_token expires rather than
          // silently refreshing it. We intercept that here and re-mint the
          // session from the still-alive Firebase session without showing a popup.
          if (hasFirebaseWebConfig) {
            const healed = await firebaseSilentRefresh();
            if (healed) {
              // onAuthStateChange will fire again immediately with the new session.
              // Do not clear tokens or update state — the next event handles it.
              setAuthReady(true);
              return;
            }
          }

          // Session could not be healed — this is a confirmed, real sign-out.
          tokenStore.clear();
          sb.realtime.setAuth(null);
          setIsAuthed(false);
        }
        // For all other events (PASSWORD_RECOVERY, USER_UPDATED, etc.) we mark
        // auth as ready but do not change the isAuthed flag.
        setAuthReady(true);
      },
    );

    // ── 5. Foreground resume refresh ──────────────────────────────────────────
    // When the device sleeps, the JavaScript timer Supabase uses for auto-refresh
    // is frozen. On resume, the stored access token may already be expired. We
    // proactively refresh before any API call fires to prevent 401 cascades.
    //
    // Strategy: try Supabase's own refresh first (covers phone / email / password
    // sessions that have a proper refresh_token). If that fails AND Firebase is
    // configured, fall back to the Firebase silent re-bridge (covers Google
    // sessions created via the Firebase → Supabase popup bridge).
    let foregroundCleanup: (() => void) | null = null;

    const handleForeground = async () => {
      const { data } = await sb.auth.refreshSession().catch(() => ({ data: null }));
      if (!data?.session && hasFirebaseWebConfig) {
        // Supabase couldn't refresh (no refresh_token for id_token sessions) —
        // attempt Firebase silent re-auth.
        await firebaseSilentRefresh();
      }
      // Both paths trigger onAuthStateChange which updates state and tokenStore.
    };

    // Try Capacitor (native), fall back to the Web Visibility API.
    import("@capacitor/app")
      .then(({ App: CapApp }) => {
        const handle = CapApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void handleForeground();
        });
        foregroundCleanup = () => void handle.then((h) => h.remove()).catch(() => {});
      })
      .catch(() => {
        // Plain web environment — use the Page Visibility API.
        const onVisible = () => {
          if (document.visibilityState === "visible") void handleForeground();
        };
        document.addEventListener("visibilitychange", onVisible);
        foregroundCleanup = () => document.removeEventListener("visibilitychange", onVisible);
      });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      clearTimeout(readyTimer);
      subscription.unsubscribe();
      foregroundCleanup?.();
    };
  }, []);

  return { isAuthed, setIsAuthed, authReady };
}
