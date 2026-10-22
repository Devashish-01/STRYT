/**
 * `fetch` that gives up. On a weak mobile connection a request can sit open for minutes without failing, and a spinner that
 * waits on it never stops — the browser's own timeout is far longer than anyone will wait. The deadline covers the whole
 * exchange, headers and body, because a body that stalls half-way hangs `res.json()` just as badly.
 */
export class FetchTimeoutError extends Error {
  constructor(ms: number) {
    super(`request timed out after ${ms}ms`);
    this.name = "FetchTimeoutError";
  }
}

export const DEFAULT_FETCH_MS = 5000;

/** GET `url` and parse the JSON, within `ms`. Resolves `{ ok: false }` for an HTTP error; rejects on a network error or timeout. */
export async function fetchJson<T = any>(url: string, ms: number = DEFAULT_FETCH_MS, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch (e) {
    if (timedOut) throw new FetchTimeoutError(ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve with `fallback` if `work` hasn't settled within `ms`. `work` keeps running; its result is simply no longer awaited. */
export function withDeadline<T, F = null>(work: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}
