import { useEffect, useState } from "react";
import { tokenStore } from "@/lib/auth";
import { getSupabase } from "@/lib/supabaseClient";

export function useAuthSession() {
  const [isAuthed, setIsAuthed] = useState(tokenStore.isAuthed);
  // False until the first Supabase session check resolves. The route guard waits
  // on this so an OAuth / magic-link redirect (which carries ?code= / #access_token
  // and is exchanged for a session asynchronously) is never bounced back to the
  // login screen mid-callback. In mock mode there's no async auth, so it's ready
  // immediately.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let sb: ReturnType<typeof getSupabase>;
    try {
      sb = getSupabase();
    } catch (e) {
      // Missing/invalid Supabase env (e.g. unset on the host). Don't hang the app
      // on the loading splash forever — fall through to the login screen.
      console.error("Supabase init failed:", e);
      setAuthReady(true);
      return;
    }

    // Safety net: if getSession() stalls (flaky network), never trap the user on
    // the splash — mark auth ready after a few seconds so routing can proceed.
    const readyTimer = setTimeout(() => setAuthReady(true), 6000);

    // Resolve the initial session on mount. With detectSessionInUrl enabled, a
    // Google/email redirect lands here and getSession() awaits the code→session
    // exchange before resolving — so by the time this runs we have a definitive
    // answer. The live session is the source of truth; tokenStore is only a cache.
    void sb.auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          tokenStore.set(data.session.access_token, data.session.refresh_token);
          // Hand the JWT to the realtime socket. Without this, Realtime treats
          // the connection as `anon` and RLS-protected tables (chat messages,
          // conversations, agreements…) silently deliver zero postgres_changes,
          // so the app only updates on a manual refetch. supabase-js does this
          // on some auth events but not reliably on the restored INITIAL_SESSION.
          sb.realtime.setAuth(data.session.access_token);
          setIsAuthed(true);
        } else {
          // BUG FIX #1: Do NOT call tokenStore.clear() here.
          // getSession() can return null when the network is unavailable at
          // startup (Supabase tries to refresh an expired token but the request
          // fails). Clearing tokens here turns a transient network error into
          // a permanent logout. The onAuthStateChange SIGNED_OUT event below
          // is the correct and authoritative place to clear credentials — it
          // only fires when Supabase has confirmed the session is truly invalid.
          setIsAuthed(false);
        }
      })
      .catch((e) => {
        // Network error during startup — leave stored tokens intact so the user
        // stays "logged in" optimistically. The session will re-validate on the
        // next successful network request or foreground resume.
        console.warn("getSession failed (network?), keeping stored session:", e);
      })
      .finally(() => {
        clearTimeout(readyTimer);
        setAuthReady(true);
      });

    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (session) {
        tokenStore.set(session.access_token, session.refresh_token);
        // Keep the realtime socket's token in sync on sign-in and every silent
        // TOKEN_REFRESHED, so long-lived sessions don't drift into an expired
        // token that Realtime rejects (which also manifests as "stopped updating").
        sb.realtime.setAuth(session.access_token);
        setIsAuthed(true);
      } else if (event === "SIGNED_OUT") {
        // Only clear on an explicit, confirmed server-side sign-out — not on
        // transient network failures. This is the single authoritative logout path.
        tokenStore.clear();
        sb.realtime.setAuth(null);
        setIsAuthed(false);
      }
      setAuthReady(true);
    });

    // BUG FIX #3: Capacitor native foreground resume re-validation.
    // After the phone sleeps for hours, the JS auto-refresh timer is frozen in
    // the suspended WebView. When the user reopens the app, the stored access
    // token may be expired. Proactively calling refreshSession() on every
    // foreground event re-syncs the Supabase session before any API call fires,
    // preventing 401 cascades that would otherwise clear the session.
    let appStateCleanup: (() => void) | null = null;
    import("@capacitor/app")
      .then(({ App }) => {
        const listenerPromise = App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            void sb.auth.refreshSession().catch(() => {
              // Refresh failed (still offline) — the stored session remains,
              // and the next successful network call will trigger onAuthStateChange.
            });
          }
        });
        appStateCleanup = () => {
          void listenerPromise.then((h) => h.remove()).catch(() => {});
        };
      })
      .catch(() => {
        // Not a Capacitor environment (e.g. plain web) — skip, use visibilitychange.
        const onVisible = () => {
          if (document.visibilityState === "visible") {
            void sb.auth.refreshSession().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", onVisible);
        appStateCleanup = () => document.removeEventListener("visibilitychange", onVisible);
      });

    return () => {
      clearTimeout(readyTimer);
      subscription.unsubscribe();
      appStateCleanup?.();
    };
  }, []);

  return { isAuthed, setIsAuthed, authReady };
}
