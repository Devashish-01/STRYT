// Model of the STRYT push-notification delivery chain used by the bug-condition
// exploration tests (Task 1 of the push-notification-delivery bugfix spec).
//
// The model is intentionally faithful to the REAL repository state: it inspects
// the actual native sources (MainActivity.java, AndroidManifest.xml), the actual
// send-push edge function, and the actual .env so that the same test:
//   * FAILS on the unfixed code/config  (proves the bug exists — Task 1)
//   * PASSES once the fix is applied     (validates Property 1 — Task 3.6)
//
// Input domain (from design.md / bugfix.md "Bug Condition Derivation"):
//   { platform, hasValidToken, appState, backendConfigured }

import fs from "node:fs";
import path from "node:path";

export type Platform = "android" | "web";
export type AppState = "open" | "background" | "closed";

export interface NotificationDelivery {
  platform: Platform;
  hasValidToken: boolean; // FCM token (android) OR push_subscriptions row (web)
  appState: AppState;
  backendConfigured: boolean; // GUCs + edge secrets set for this platform
}

export interface DeliveryResult {
  osBannerDisplayed: boolean;
  sendPushInvoked: boolean;
  webSubscriptionRowExists: boolean;
  webSent: number;
  fcmSent: number;
  channelTargeted: string | null;
  channelExistsOnDevice: boolean;
}

// Repo root: vitest runs with cwd at the project root.
const ROOT = process.cwd();

function readIfExists(rel: string): string {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

// --- Live repository probes ------------------------------------------------

/**
 * The channel id the send-push edge function targets for Android FCM messages.
 * Read live so the model tracks the real contract instead of a hard-coded copy.
 */
export function sendPushChannelId(): string | null {
  const src = readIfExists("supabase/functions/send-push/index.ts");
  const m = src.match(/channel_id:\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

/**
 * Whether the Android app guarantees the send-push target channel exists on the
 * device. True when EITHER MainActivity creates a matching NotificationChannel
 * OR the manifest declares a default_notification_channel_id fallback equal to
 * the targeted channel. On the unfixed code neither is true, so Android 8+
 * silently drops the notification.
 */
export function androidChannelExists(): boolean {
  const channelId = sendPushChannelId();
  if (!channelId) return false;

  const mainActivity = readIfExists(
    "android/app/src/main/java/in/stryt/app/MainActivity.java",
  );
  const createsChannel =
    /createNotificationChannel/.test(mainActivity) &&
    mainActivity.includes(channelId);

  const manifest = readIfExists("android/app/src/main/AndroidManifest.xml");
  const declaresDefault =
    /default_notification_channel_id/.test(manifest) &&
    manifest.includes(channelId);

  return createsChannel || declaresDefault;
}

/**
 * Whether the web client is configured to create a push subscription.
 * registerPush() bails at `if (!vapidKey ...) return;` when VITE_VAPID_PUBLIC_KEY
 * is empty, so no push_subscriptions row is ever created.
 */
export function webVapidConfigured(): boolean {
  const env = readIfExists(".env");
  // [ \t] rather than \s so the match cannot span a newline into the next line.
  const m = env.match(/^[ \t]*VITE_VAPID_PUBLIC_KEY[ \t]*=[ \t]*(.*)$/m);
  if (!m) return false;
  return m[1].trim().length > 0;
}

/**
 * Whether the backend prerequisites (DB GUCs + edge secrets) are verified.
 * These live in Supabase, not the repo, so they are surfaced via an env flag a
 * verifier sets once `alter database ... set app.settings.*` and
 * `supabase secrets set ...` are confirmed (design tasks 3.4/3.5).
 */
export function liveBackendConfigured(): boolean {
  return process.env.PUSH_BACKEND_CONFIGURED === "true";
}

// --- The delivery chain model (deliverPush') -------------------------------

/**
 * The two — and only two — dimensions the fix changes:
 *   - androidChannelExists: whether the on-device notification channel that
 *     send-push targets is created/declared (Change 1 + Change 2).
 *   - webVapidConfigured:   whether VITE_VAPID_PUBLIC_KEY is set so registerPush
 *     upserts a push_subscriptions row (Change 3).
 * Everything else in the delivery chain is fix-independent (see the preservation
 * probes below). Modeling F vs F' as this explicit toggle lets the preservation
 * tests compare the unfixed (F) and fixed (F') chains deterministically, without
 * depending on whether the repo has actually been fixed yet.
 */
export interface FixState {
  androidChannelExists: boolean;
  webVapidConfigured: boolean;
}

/** F — the original, unfixed delivery chain. */
export const UNFIXED: FixState = {
  androidChannelExists: false,
  webVapidConfigured: false,
};

/** F' — the fixed delivery chain. */
export const FIXED: FixState = {
  androidChannelExists: true,
  webVapidConfigured: true,
};

/**
 * Models the observable outcome of the delivery chain for an input X under an
 * explicit fix state. `deliverPushWith(x, UNFIXED)` is F, `deliverPushWith(x,
 * FIXED)` is F'. The android branch never reads the web toggle and the web
 * branch never reads the android toggle — per-platform independence (req 3.6)
 * is structural.
 */
export function deliverPushWith(
  x: NotificationDelivery,
  fix: FixState,
): DeliveryResult {
  const channelTargeted = sendPushChannelId();
  const base: DeliveryResult = {
    osBannerDisplayed: false,
    sendPushInvoked: false,
    webSubscriptionRowExists: false,
    webSent: 0,
    fcmSent: 0,
    channelTargeted,
    channelExistsOnDevice: false,
  };

  // Trigger no-ops / send-push skips the path when the backend is unconfigured.
  if (!x.backendConfigured) {
    return base;
  }

  if (x.platform === "android") {
    // There is a token to deliver to; FCM v1 accepts the message.
    const invoked = x.hasValidToken;
    const channelExists = fix.androidChannelExists;
    // Android 8+ only shows the banner if the targeted channel exists.
    const banner = invoked && channelExists;
    return {
      ...base,
      sendPushInvoked: invoked,
      fcmSent: invoked ? 1 : 0,
      channelExistsOnDevice: channelExists,
      osBannerDisplayed: banner,
    };
  }

  // web
  // registerPush upserts a push_subscriptions row only when VAPID is configured.
  const subExists = fix.webVapidConfigured;
  return {
    ...base,
    sendPushInvoked: true,
    webSubscriptionRowExists: subExists,
    webSent: subExists ? 1 : 0,
    osBannerDisplayed: subExists,
  };
}

/**
 * Models the observable outcome of the current delivery chain for an input X,
 * reading the live repo state for the two code defects (Android channel, web
 * VAPID). This is deliverPush' — after the fix it yields osBannerDisplayed=true
 * for every bug-condition input; on the unfixed code it does not.
 */
export function deliverPush(x: NotificationDelivery): DeliveryResult {
  return deliverPushWith(x, {
    androidChannelExists: androidChannelExists(),
    webVapidConfigured: webVapidConfigured(),
  });
}

/**
 * Bug condition from design.md — a push that SHOULD be displayable.
 *   android: backendConfigured AND hasValidToken
 *   web:     backendConfigured  (hasValidToken is forced false by the bug itself)
 */
export function isBugCondition(x: NotificationDelivery): boolean {
  if (x.platform === "android") {
    return x.backendConfigured && x.hasValidToken;
  }
  if (x.platform === "web") {
    return x.backendConfigured;
  }
  return false;
}

// ===========================================================================
// Preservation model (Task 2 — Property 2)
// ===========================================================================
//
// The fix touches only two things (the FixState toggles above). Everything
// below is derived from source files the fix does NOT modify:
//   * supabase/functions/send-push/index.ts  (delivery + stale cleanup + coalesce type)
//   * src/sw.js                                (web tag coalescing + NAVIGATE routing)
//   * src/lib/pushNotifications.ts             (native push-nav routing)
//   * supabase/migrations/*push*.sql           (non-blocking fire-and-forget insert)
//
// These probes read the live repo, so they return the SAME value before and
// after the fix — which is exactly the invariant preservation asserts. The
// preservation tests observe these on the unfixed code and then assert they
// are stable across F and F'.

function sendPushSrc(): string {
  return readIfExists("supabase/functions/send-push/index.ts");
}
function swSrc(): string {
  return readIfExists("src/sw.js");
}
function pushClientSrc(): string {
  return readIfExists("src/lib/pushNotifications.ts");
}

/** req 3.2 — the trigger fires pg_net async and swallows errors, so a push
 * failure never rolls back or errors the notifications insert. */
export function insertIsNonBlocking(): boolean {
  // Probe the trigger migration for the fire-and-forget contract.
  const files = [
    "supabase/migrations/20260731_push_on_every_notification.sql",
  ];
  const src = files.map(readIfExists).join("\n");
  // Async HTTP from Postgres → the insert never blocks on send-push.
  const usesPgNet = /net\.http_post/i.test(src) || /pg_net/i.test(src);
  // An `exception when others -> return new` handler swallows push failures so
  // the insert is neither rolled back nor errored.
  const swallows = /when\s+others/i.test(src) && /return\s+new/i.test(src);
  return usesPgNet && swallows;
}

/** req 3.3 — send-push deletes a push_subscriptions row on web 404/410. */
export function webStaleCleanupEnabled(): boolean {
  const src = sendPushSrc();
  const detects = src.includes("404") && src.includes("410");
  const deletes = /from\(["']push_subscriptions["']\)\s*\.delete\(\)/.test(src);
  return detects && deletes;
}

/** req 3.3 — send-push deletes an fcm_tokens row on UNREGISTERED/INVALID_ARGUMENT. */
export function fcmStaleCleanupEnabled(): boolean {
  const src = sendPushSrc();
  const detects =
    src.includes("UNREGISTERED") && src.includes("INVALID_ARGUMENT");
  const deletes = /from\(["']fcm_tokens["']\)\s*\.delete\(\)/.test(src);
  return detects && deletes;
}

/** req 3.4 — native tap dispatches the "push-nav" CustomEvent for SPA nav. */
export function nativeNavEvent(): string | null {
  const src = pushClientSrc();
  const m = src.match(/new CustomEvent\(["']([^"']+)["']/);
  return m ? m[1] : null;
}

/** req 3.4 — web SW tap posts { type: "NAVIGATE", path } to the client. */
export function webNavMessageType(): string | null {
  const src = swSrc();
  const m = src.match(/postMessage\(\{\s*type:\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

/** req 3.5 — web SW groups banners by `tag: data.type`. */
export function webCoalescesByType(): boolean {
  const src = swSrc();
  return /tag:\s*data\.type/.test(src);
}

/** req 3.5 — FCM payload preserves `data.type`. */
export function fcmPreservesDataType(): boolean {
  const src = sendPushSrc();
  return /data:\s*\{[^}]*type:/.test(src);
}

/**
 * req 3.5 — coalescing metadata for a logical notification type. send-push
 * sends `type: type || "SYSTEM"` in both the web payload and the FCM `data`;
 * the SW groups by `tag: data.type`. So the effective coalescing key for a
 * type T is T (or "SYSTEM" when absent). Fix-independent.
 */
export function coalescingMeta(type: string | null | undefined): {
  webTag: string;
  fcmDataType: string;
} {
  const sendType = type && type.length > 0 ? type : "SYSTEM";
  return { webTag: sendType, fcmDataType: sendType };
}

// --- Mixed valid/stale credential processing (req 3.3, mirrors send-push) ---

export type WebSubStatus = "ok" | "gone404" | "gone410" | "otherError";
export type FcmStatus = "ok" | "unregistered" | "invalidArgument" | "otherError";

export interface WebSub {
  endpoint: string;
  status: WebSubStatus;
}
export interface FcmTok {
  token: string;
  status: FcmStatus;
}

export interface CredentialOutcome {
  deliveredEndpoints: string[];
  deletedEndpoints: string[];
  deliveredTokens: string[];
  deletedTokens: string[];
  webSent: number;
  fcmSent: number;
}

/**
 * Mirrors the send-push delivery + cleanup branches:
 *   web:  ok -> delivered (webSent++); 404/410 -> deleted; other -> neither.
 *   fcm:  ok -> delivered (fcmSent++); UNREGISTERED/INVALID_ARGUMENT -> deleted; other -> neither.
 * `_fix` is accepted to document that cleanup is fix-independent — it is never
 * read, so the outcome is identical for F and F'.
 */
export function processCredentials(
  subs: WebSub[],
  toks: FcmTok[],
  _fix: FixState,
): CredentialOutcome {
  const out: CredentialOutcome = {
    deliveredEndpoints: [],
    deletedEndpoints: [],
    deliveredTokens: [],
    deletedTokens: [],
    webSent: 0,
    fcmSent: 0,
  };

  for (const s of subs) {
    if (s.status === "ok") {
      out.deliveredEndpoints.push(s.endpoint);
      out.webSent++;
    } else if (s.status === "gone404" || s.status === "gone410") {
      out.deletedEndpoints.push(s.endpoint);
    }
    // otherError: not delivered, not deleted (unchanged by the fix).
  }

  for (const t of toks) {
    if (t.status === "ok") {
      out.deliveredTokens.push(t.token);
      out.fcmSent++;
    } else if (t.status === "unregistered" || t.status === "invalidArgument") {
      out.deletedTokens.push(t.token);
    }
    // otherError: not delivered, not deleted.
  }

  return out;
}
