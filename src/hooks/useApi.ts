import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabaseClient";
import { useApp } from "@/store";

interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

// Module-level stale-while-revalidate cache, keyed by an explicit string the
// caller opts in with. Callers that omit `cacheKey` get the exact original
// behaviour (always loading=true on mount, no cache) — this is purely
// additive, so it's safe to roll out to call sites one at a time.
//
// On a cache hit: data + loading=false render on the very first paint (no
// skeleton flash), while a fresh fetch still runs in the background and
// silently replaces both the screen and the cache entry when it resolves —
// this is what makes navigating back to an already-visited screen feel
// instant instead of re-showing a skeleton every time.
const queryCache = new Map<string, unknown>();
let queryCacheEpoch = 0;

/** Remove data fetched for the previous account before another user signs in. */
export function clearQueryCache(): void {
  queryCacheEpoch += 1;
  queryCache.clear();
}

/** Drop a cached entry (e.g. after a mutation). Optional bust clears in-flight
 *  coalesced GETs in businessService/providerService so refetch is fresh. */
export function invalidateQueryCache(key: string, bustInflight?: () => void) {
  queryCache.delete(key);
  bustInflight?.();
}

/** Drop every cached entry whose key starts with `prefix` (e.g. "notif:"). */
export function invalidateQueryCacheByPrefix(prefix: string) {
  for (const key of Array.from(queryCache.keys())) {
    if (key.startsWith(prefix)) queryCache.delete(key);
  }
}

/** Read a query cache entry synchronously if present (distinguishing cached undefined via hasQueryCache). */
export function hasQueryCache(key: string): boolean {
  return queryCache.has(key);
}

/** Read a query cache entry synchronously without triggering a fetch. */
export function peekQueryCache<T>(key: string): T | undefined {
  return queryCache.get(key) as T | undefined;
}

/** Find the first match across cached entries sharing a prefix (e.g. "my-businesses:"). */
export function findInQueryCacheByPrefix<T>(prefix: string, picker: (value: unknown) => T | undefined): T | undefined {
  for (const [key, value] of queryCache.entries()) {
    if (!key.startsWith(prefix)) continue;
    const hit = picker(value);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string): QueryState<T> {
  const initialHit = cacheKey && queryCache.has(cacheKey);
  const [data, setData] = useState<T | undefined>(initialHit ? (queryCache.get(cacheKey!) as T) : undefined);
  const [loading, setLoading] = useState(!initialHit);
  const [error, setError] = useState<ApiError | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;
  const isFirstRun = useRef(true);
  // Screens are free to also render their own <ErrorView>, but a query that
  // fails silently (no loading state left, no data, nothing on screen) was
  // a recurring complaint — this is the one place every fetch passes through,
  // so it's the one place a failure can never go unseen.
  const { showToast } = useApp();

  const run = useCallback((isInitial = false) => {
    let active = true;
    const requestEpoch = queryCacheEpoch;
    const key = keyRef.current;
    const hit = key ? queryCache.has(key) : false;
    if (hit) {
      // Revalidate silently — the screen already has (possibly stale) data
      // to show, so there's no reason to blank it out while refetching.
      setData(queryCache.get(key!) as T);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    const execute = () => {
      fnRef
        .current()
        .then((res) => {
          if (active && requestEpoch === queryCacheEpoch) {
            setData(res);
            if (key) queryCache.set(key, res);
          }
        })
        .catch((e) => {
          const err = e instanceof ApiError ? e : new ApiError(0, { code: "INTERNAL", message: String(e) });
          if (active) {
            setError(err);
            // Distinguish "you got signed out" from generic network noise — a 401
            // mid-session otherwise looks like a random loading failure.
            if (err.status === 401 || err.code === "UNAUTHENTICATED") {
              showToast("Session expired — sign in again to continue");
            } else if (!navigator.onLine) {
              showToast("You're offline — reconnect to load this");
            } else {
              showToast("Couldn't load — check your connection and try again");
            }
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    // Only stagger the very first fetch of a screen that has nothing cached
    // to show yet (avoids a same-tick flash of the skeleton on a fast
    // connection). Once there's something on screen — cached data, or any
    // refetch — there's no reason to add latency, so it runs immediately.
    if (isInitial && !hit) {
      const timer = setTimeout(execute, 150);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    } else {
      execute();
      return () => {
        active = false;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cleanup = run(isFirstRun.current);
    isFirstRun.current = false;
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: () => run(false) };
}

export function useQueryWithRealtime<T>(
  fn: () => Promise<T>,
  tableName: string | null,
  deps: unknown[] = [],
  filter?: string,
  cacheKey?: string
): QueryState<T> {
  const state = useQuery(fn, deps, cacheKey);
  // useQuery returns `refetch: () => run(false)` — a fresh closure on every
  // render. With `refetch` in the effect's dependency array below, the channel
  // was torn down and re-subscribed on EVERY render, so a screen that
  // re-rendered while data streamed in spent its life reconnecting and could
  // miss the events arriving in the gap (CUSTOMER_QUEUE #Q8, MY_APPOINTMENTS
  // #A8).
  //
  // Held in a ref instead: the subscription depends only on what actually
  // identifies it — table and filter — while still calling the newest refetch.
  // Same idiom as fnRef/optsRef in useMutation below.
  const refetchRef = useRef(state.refetch);
  refetchRef.current = state.refetch;

  useEffect(() => {
    if (!hasSupabaseEnv || !tableName) return;
    const table = tableName;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // Fallback: even when realtime is healthy, poll at a slow cadence so the
    // customer is never more than 30 s stale if they leave the tab and come back
    // or if the subscription silently drops an event.
    const fallbackPoll = setInterval(() => {
      if (active && typeof document !== "undefined" && document.visibilityState !== "hidden") {
        refetchRef.current();
      }
    }, 30_000);

    const sb = getSupabase();
    let currentChannel: ReturnType<typeof sb.channel> | null = null;

    function subscribe() {
      if (!active) return;
      const uniqueId = Math.random().toString(36).slice(2, 9);
      let channelName = `rt:${table}:${uniqueId}`;
      if (filter) channelName += `:${filter}`;

      const channel = sb
        .channel(channelName)
        .on(
          "postgres_changes" as any,
          {
            event: "*",
            schema: "public",
            table,
            ...(filter ? { filter } : {}),
          },
          () => {
            if (active) refetchRef.current();
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            // A silent failure here is exactly the "I must refresh to see changes"
            // symptom: the channel never delivers events. Log it, refetch once,
            // and retry the subscription after a short back-off so the customer
            // is not stuck until manual pull-to-refresh.
            console.warn(`[realtime] "${tableName}" subscription ${status} — retrying in 5 s.`);
            sb.removeChannel(channel);
            if (currentChannel === channel) currentChannel = null;
            if (active) {
              refetchRef.current(); // immediate catch-up fetch
              retryTimer = setTimeout(subscribe, 5_000);
            }
          }
        });
      currentChannel = channel;
    }

    subscribe();

    return () => {
      active = false;
      clearInterval(fallbackPoll);
      if (retryTimer != null) clearTimeout(retryTimer);
      if (currentChannel) sb.removeChannel(currentChannel);
    };
  }, [tableName, filter]);

  return state;
}

interface MutationState<TArgs, TResult> {
  mutate: (args: TArgs) => Promise<TResult | undefined>;
  pending: boolean;
  error: ApiError | null;
  reset: () => void;
}

export function useMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts?: { onSuccess?: (r: TResult) => void; onError?: (e: ApiError) => void }
): MutationState<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const mutate = useCallback(async (args: TArgs) => {
    setPending(true);
    setError(null);
    try {
      const r = await fnRef.current(args);
      optsRef.current?.onSuccess?.(r);
      return r;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, { code: "INTERNAL", message: String(e) });
      setError(err);
      optsRef.current?.onError?.(err);
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { mutate, pending, error, reset: () => setError(null) };
}
