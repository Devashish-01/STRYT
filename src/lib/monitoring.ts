// Lightweight client-side error monitoring — captures crashes and silent async
// failures and ships them to the `client_errors` Supabase table so production
// errors are actually visible (see supabase/migrations/20260820_client_error_sink.sql).
//
// Design rules (this module must be bulletproof — it runs in the failure path):
//   • NEVER throws. Every path is wrapped; a broken logger must not break the app.
//   • Always console.errors locally (dev + native WebView debugging).
//   • Best-effort remote sink: only when Supabase env is present AND the user is
//     authenticated (RLS blocks anon). Sink failures are swallowed.
//   • Deduped per session + rate-limited so one hot error loop can't spam the DB.
//   • No PII beyond the error text/stack + URL + UA the user already exposes.
//
// A clean seam for a full APM later: add another reporter inside `report()`
// (e.g. Sentry.captureException) — everything already funnels through here.

import { getSupabase, hasSupabaseEnv } from "./supabaseClient";

export type ErrorKind = "REACT" | "WINDOW_ERROR" | "UNHANDLED_REJECTION" | "MANUAL";

const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;
const MAX_PER_MINUTE = 12; // hard cap on remote inserts per rolling minute
const APP_VERSION = (import.meta as any).env?.VITE_APP_VERSION ?? null;

let initialized = false;
let sinkReady = false; // flips true after the first successful insert; also gated below
const sendTimes: number[] = [];
const seen = new Set<string>();
const breadcrumbs: { t: number; msg: string }[] = [];

function withinRateLimit(): boolean {
  const now = Date.now();
  while (sendTimes.length && now - sendTimes[0] > 60_000) sendTimes.shift();
  if (sendTimes.length >= MAX_PER_MINUTE) return false;
  sendTimes.push(now);
  return true;
}

/** Record a short trail of recent UI events; attached to the next captured error. */
export function addBreadcrumb(msg: string): void {
  try {
    breadcrumbs.push({ t: Date.now(), msg: String(msg).slice(0, 200) });
    if (breadcrumbs.length > 25) breadcrumbs.shift();
  } catch { /* never throw */ }
}

/**
 * Capture an error. Safe to call from anywhere (event handlers, catch blocks,
 * the ErrorBoundary). Returns nothing and never throws.
 */
export function captureException(
  err: unknown,
  kind: ErrorKind = "MANUAL",
  context?: Record<string, unknown>
): void {
  try {
    const e = err as any;
    const message = String(e?.message ?? e ?? "Unknown error").slice(0, MAX_MESSAGE);
    const stack = String(e?.stack ?? "").slice(0, MAX_STACK);

    // 1) Always visible locally.
    // eslint-disable-next-line no-console
    console.error(`[monitor:${kind}]`, message, e);

    // 2) Dedupe within the session so a render loop logs once, not thousands.
    const key = `${kind}|${message}|${stack.slice(0, 240)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (seen.size > 300) seen.clear();

    // 3) Remote sink — best-effort, gated, swallowed.
    if (!hasSupabaseEnv || !withinRateLimit()) return;
    void sendToSink({ kind, message, stack, context });
  } catch {
    /* monitoring must never throw */
  }
}

async function sendToSink(payload: {
  kind: ErrorKind;
  message: string;
  stack: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = getSupabase();
    // RLS blocks anon; skip the round-trip if there's no session.
    const { data } = await sb.auth.getSession();
    if (!data.session) return;

    await sb.from("client_errors").insert({
      // user_id is stamped server-side from the JWT (column default) — don't send it.
      kind: payload.kind,
      message: payload.message,
      stack: payload.stack || null,
      url: (typeof location !== "undefined" ? location.href : "").slice(0, 1000),
      user_agent: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 400),
      app_version: APP_VERSION,
      context: { ...(payload.context ?? {}), breadcrumbs: breadcrumbs.slice(-12) },
    });
    sinkReady = true;
  } catch {
    /* swallow — the table might be pre-migration, offline, or RLS-blocked */
  }
}

/** Wire the global handlers once, at app boot. Idempotent + SSR/native-safe. */
export function initMonitoring(): void {
  try {
    if (initialized || typeof window === "undefined") return;
    initialized = true;

    window.addEventListener("error", (ev: ErrorEvent) => {
      // Only real JS exceptions — skip resource-load errors (img/script 404s),
      // which fire this event with no `error` object and are just noise.
      if (!ev.error) return;
      captureException(ev.error, "WINDOW_ERROR", {
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
      });
    });

    window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
      // The main source of silently-swallowed async failures (R-2 safety net).
      captureException(ev.reason, "UNHANDLED_REJECTION");
    });
  } catch {
    /* never block boot on monitoring */
  }
}

/** For diagnostics/tests — whether a remote insert has ever succeeded. */
export function isSinkReady(): boolean {
  return sinkReady;
}
