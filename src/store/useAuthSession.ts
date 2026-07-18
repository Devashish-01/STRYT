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
          tokenStore.clear();
          sb.realtime.setAuth(null);
          setIsAuthed(false);
        }
      })
      .catch((e) => {
        console.error("getSession failed:", e);
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
        tokenStore.clear();
        sb.realtime.setAuth(null);
        setIsAuthed(false);
      }
      setAuthReady(true);
    });
    return () => {
      clearTimeout(readyTimer);
      subscription.unsubscribe();
    };
  }, []);

  return { isAuthed, setIsAuthed, authReady };
}
