import { config } from "@/config";
import { tokenStore } from "./auth";

export interface ApiErrorShape {
  code: string;
  message: string;
  fields?: Record<string, string>;
  request_id?: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;
  requestId?: string;
  constructor(status: number, body: ApiErrorShape) {
    super(body.message || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = body.code || "INTERNAL";
    this.fields = body.fields;
    this.requestId = body.request_id;
  }
}

export interface Page<T> {
  data: T[];
  page: { next_cursor: string | null; has_more: boolean };
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  auth?: boolean;
}

function buildUrl(path: string, query?: RequestOpts["query"]) {
  const url = new URL(config.apiUrl.replace(/\/$/, "") + path);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

// Last-seen rate-limit info (for graceful "slow down" UI).
export const rateLimit = { limit: 0, remaining: 0, reset: 0 };

export async function apiRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, query, idempotencyKey, auth = true } = opts;

  async function doFetch(): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth && tokenStore.access) headers["Authorization"] = `Bearer ${tokenStore.access}`;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw new ApiError(0, { code: "NETWORK", message: "Network unreachable. Check your connection." });
  }

  // On 401, attempt a single silent refresh + retry (skip for the refresh call itself).
  if (res.status === 401 && auth && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      try {
        res = await doFetch();
      } catch {
        throw new ApiError(0, { code: "NETWORK", message: "Network unreachable. Check your connection." });
      }
    }
  }

  rateLimit.limit = Number(res.headers.get("X-RateLimit-Limit") ?? rateLimit.limit);
  rateLimit.remaining = Number(res.headers.get("X-RateLimit-Remaining") ?? rateLimit.remaining);
  rateLimit.reset = Number(res.headers.get("X-RateLimit-Reset") ?? rateLimit.reset);

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errBody: ApiErrorShape = json?.error ?? { code: "INTERNAL", message: "Something went wrong" };
    throw new ApiError(res.status, errBody);
  }

  return json as T;
}

export function genIdempotencyKey() {
  return "idem_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- Silent token refresh on 401 ---------------------------------------
// A single in-flight refresh is shared across concurrent 401s.
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!tokenStore.refresh) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        // BUG FIX #4: Use Supabase's own session refresh instead of the legacy
        // /auth/refresh REST endpoint (which no longer exists — auth is fully
        // Supabase-managed). The old endpoint returned non-200, causing
        // tokenStore.clear() to be called and silently logging the user out.
        //
        // IMPORTANT: Do NOT call tokenStore.clear() on failure here. If the
        // network is down, refreshSession() will throw/error — we return false
        // so the caller can handle the 401 gracefully. The SIGNED_OUT event from
        // onAuthStateChange is the only authoritative place to wipe credentials.
        const { getSupabase } = await import("./supabaseClient");
        const sb = getSupabase();
        const { data, error } = await sb.auth.refreshSession();
        if (error || !data.session) {
          // Session is genuinely expired or revoked — Supabase will fire
          // SIGNED_OUT via onAuthStateChange, which clears the token store.
          return false;
        }
        tokenStore.set(data.session.access_token, data.session.refresh_token);
        return true;
      } catch {
        // Network error — return false without clearing tokens. The session
        // may still be valid once connectivity is restored.
        return false;
      } finally {
        // allow the next refresh cycle once this settles
        setTimeout(() => (refreshPromise = null), 0);
      }
    })();
  }
  return refreshPromise;
}

