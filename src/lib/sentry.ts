/**
 * Sentry, loaded only when there is somewhere to send to.
 *
 * Three things this deliberately does:
 *
 * 1. **Nothing at all without a DSN.** Dev, tests and any build where `VITE_SENTRY_DSN` is unset never touch
 *    Sentry — no init, no network, no console noise. That is P14 §14.A.2's requirement, and it is also what
 *    keeps the E2E suite from reporting its own deliberate failures.
 * 2. **Dynamic import.** The SDK is ~100 KB and is fetched only on the branch where a DSN exists, so it
 *    stays out of the entry chunk and cannot regress P11's bundle numbers for a build without one.
 * 3. **The scrubber is the `beforeSend`.** Every event goes through `scrubPii` before it leaves, the same
 *    function the `client_errors` sink uses. An event that cannot be scrubbed is dropped, not sent raw.
 *
 * Native note: this is `@sentry/react`, which runs inside the Capacitor WebView and so captures JavaScript
 * errors on Android too. Crashes in the native layer itself (Java/Kotlin) need `@sentry/capacitor`, which is
 * not installed — it should be added once a DSN exists and it can be proven on a real device, which is P13's
 * territory. Until then, native JS errors are covered and native crashes are not.
 */

import { scrubErrorReport, scrubValue } from "./scrubPii";

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;
let started = false;

/** Where the DSN comes from. Empty string when unset, which is the normal case in dev and CI. */
function dsn(): string {
  try {
    return String((import.meta as { env?: Record<string, unknown> }).env?.VITE_SENTRY_DSN ?? "").trim();
  } catch {
    return "";
  }
}

function platform(): string {
  try {
    // Capacitor sets this on the window in a native WebView.
    const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return cap?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}

/**
 * Runs an event through the same scrubber the local sink uses. Returns null to drop the event if anything
 * goes wrong — an unscrubbable event is not worth the risk of sending.
 */
export function scrubEvent<T extends Record<string, unknown>>(event: T): T | null {
  try {
    const e = event as Record<string, unknown>;
    const scrubbed = scrubErrorReport({
      message: typeof e.message === "string" ? e.message : undefined,
      url: typeof e.request === "object" && e.request
        ? String((e.request as { url?: unknown }).url ?? "")
        : undefined,
    });

    const out: Record<string, unknown> = { ...e };
    if (scrubbed.message !== undefined) out.message = scrubbed.message;

    // Breadcrumbs, exception values, request and extra all carry free text.
    if (Array.isArray(e.breadcrumbs)) out.breadcrumbs = scrubValue(e.breadcrumbs);
    if (e.exception) out.exception = scrubValue(e.exception);
    if (e.request) out.request = scrubValue(e.request);
    if (e.extra) out.extra = scrubValue(e.extra);
    if (e.contexts) out.contexts = scrubValue(e.contexts);

    // A user object is identity by definition. Keep only the opaque id.
    if (e.user && typeof e.user === "object") {
      const u = e.user as Record<string, unknown>;
      out.user = u.id ? { id: u.id } : undefined;
    }
    return out as T;
  } catch {
    return null;
  }
}

/**
 * Starts Sentry if a DSN is configured. Safe to call more than once and from anywhere; never throws, because
 * it runs at boot and a monitoring failure must not stop the app from starting.
 */
export async function initSentry(): Promise<void> {
  try {
    if (started || typeof window === "undefined") return;
    const d = dsn();
    if (!d) return; // the normal path in dev, CI and any build without a DSN
    started = true;

    const mod = await import("@sentry/react");
    sentry = mod;

    mod.init({
      dsn: d,
      release: `stryt@${__APP_VERSION__}-${platform()}`,
      environment: (import.meta as { env?: Record<string, unknown> }).env?.MODE === "production"
        ? "production"
        : "staging",
      // Errors only. Performance tracing samples every navigation and would cost quota this project has no
      // budget for; turn it on deliberately, not by default.
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event as unknown as Record<string, unknown>) as never,
      beforeBreadcrumb: (crumb) => scrubValue(crumb) as never,
    });
  } catch {
    // A monitoring library that fails to load must not take the app down with it.
    started = false;
  }
}

/** Forwards an already-captured error to Sentry, if it is running. Never throws. */
export function reportToSentry(err: unknown, context?: Record<string, unknown>): void {
  try {
    if (!sentry) return;
    sentry.captureException(err, context ? { extra: scrubValue(context) } : undefined);
  } catch {
    /* monitoring must never throw */
  }
}

/** Test seam: whether Sentry is currently active. */
export function sentryActive(): boolean {
  return sentry !== null;
}
