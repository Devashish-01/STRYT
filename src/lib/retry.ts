/**
 * A request that never reached the server (offline, dropped connection, DNS) — as opposed to one the server answered with
 * an error. Only these are safe to retry blindly: the server never saw the first attempt, so it cannot be applied twice.
 */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|ECONNRESET|ENOTFOUND/i.test(msg);
}

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Run `fn`, retrying only when the failure was a network error, with a short growing pause. A server-side refusal (a
 * validation error, "order cancelled") is thrown at once — retrying it would only repeat the refusal.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseMs = opts.baseMs ?? 700;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isNetworkError(e) || i === attempts - 1) throw e;
      await sleep(baseMs * (i + 1));
    }
  }
  throw lastError;
}
