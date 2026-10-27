// Product analytics — the client half of tracking plan v1 (.telemetry/tracking-plan.yaml).
//
// STRYT had Sentry and the client_errors sink, both of which answer "what broke". This answers "did anyone get a
// reply to their ask", which is the question that decides whether the product works.
//
// Division of labour, on purpose:
//   * this module reports only what the client knows — sign-in attempts, views, searches, taps, the guest funnel;
//   * every state change (request, proposal, booking, deal, delivery, review…) is emitted inside Postgres by
//     public.emit_event(), in the same transaction as the write — see supabase/migrations/20261009_analytics_v1.sql.
//     Rows cannot be dropped by an offline device or an ad blocker, and staff-side actions the client never sees are
//     covered. Never add a client event for one of those: it would double count.
//
// Design rules, inherited from monitoring.ts because this runs in ordinary user paths:
//   • NEVER throws and never awaits into a user flow. An analytics failure must be invisible.
//   • Works signed-out. The guest funnel is the point; the events_insert_guest policy allows it.
//   • Sends nothing personal. Props are typed to IDs, enums, booleans and counts — never a name, phone, address,
//     message body or free text a person typed — and still go through scrubPii as a backstop.
//   • Drops rather than queues forever. A failed send is lost on purpose.
// Admin and super_admin rows are dropped by a trigger on the table (internal_user_policy: by_role), so there is no
// role check here.

import { Capacitor } from "@capacitor/core";
import { getSupabase } from "./supabaseClient";
import { scrubValue } from "./scrubPii";
import type { Json } from "@/types/database.types";

declare const __APP_VERSION__: string;

/**
 * Every client event name, in one place. Must match the events_name_known CHECK constraint in 20261009 — adding one
 * means a migration and a decision. Call sites use these constants, never a string literal.
 */
export const EVENTS = {
  OTP_SENT: "otp_sent",
  OTP_VERIFIED: "otp_verified",
  OTP_FAILED: "otp_failed",
  SIGNUP_COMPLETED: "signup_completed",
  REQUEST_VIEWED: "request_viewed",
  SEARCH_PERFORMED: "search_performed",
  SELLER_VIEWED: "seller_viewed",
  SELLER_CONTACTED: "seller_contacted",
  NOTIFICATION_OPENED: "notification_opened",
  SHARE_LINK_OPENED: "share_link_opened",
  DELIVERY_DECLINED: "delivery_declined",
} as const;

export type SellerRef = { type: "business" | "provider"; id: string };

type RequestEntry = "feed" | "notification" | "share_link" | "map" | "profile" | "direct";
type SellerEntry = "search" | "map" | "feed" | "category" | "notification" | "share_link" | "direct";

/** Props per client event, from the tracking plan. Required props are required here; a missing one will not compile. */
export interface ClientEvents {
  otp_sent: { is_native: boolean; is_resend: boolean };
  otp_verified: { is_native: boolean; is_auto_verified: boolean };
  otp_failed: { step: "send" | "verify" | "bridge" | "session"; error_code: string; provider_error_code?: string; is_native?: boolean };
  signup_completed: { interest_count: number; has_location: boolean };
  request_viewed: { request_id: string; is_guest: boolean; is_viewer_seller: boolean; entry_source?: RequestEntry };
  search_performed: { surface: "search" | "map" | "category"; has_query: boolean; category_id?: string; result_count: number; is_guest: boolean };
  notification_opened: { notification_type: string; is_push: boolean };
  share_link_opened: { link_type: "tracking"; is_valid: boolean };
  seller_viewed: { is_guest: boolean; entry_source?: SellerEntry };
  seller_contacted: { contact_method: "call" | "directions" };
  delivery_declined: { assignment_type: "single" | "run"; delivery_id?: string };
}

export type ClientEventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Events about a seller must say which one — the compiler enforces the third argument. delivery_declined takes it
 * when the caller knows the shop (the rider console does; a decline from a notification may not).
 */
type SellerRequired = typeof EVENTS.SELLER_VIEWED | typeof EVENTS.SELLER_CONTACTED;
type SellerOptional = typeof EVENTS.DELIVERY_DECLINED;
type TrackArgs<N extends ClientEventName> = N extends SellerRequired
  ? [props: ClientEvents[N], seller: SellerRef]
  : N extends SellerOptional
    ? [props: ClientEvents[N], seller?: SellerRef]
    : [props: ClientEvents[N]];

/** Who acts, when it is not the customer. Riders decline deliveries. */
const ACTOR_ROLE: Partial<Record<ClientEventName, "staff">> = { [EVENTS.DELIVERY_DECLINED]: "staff" };

const MAX_PER_SESSION = 500;
let sent = 0;

/**
 * One id per app session, so a guest's journey can be followed from first screen to signup without knowing who they
 * are. sessionStorage, not localStorage: it must not become a durable identifier — that would turn an anonymous
 * funnel into tracking, which is a different thing entirely and not what anyone consented to. Rotated on sign-out so
 * two people sharing a phone are never stitched together.
 */
const SESSION_KEY = "stryt_analytics_session";
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = `s_${crypto.randomUUID().replace(/-/g, "")}`;
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private mode, blocked storage, SSR — an event without a session id is still worth having.
    return "s_unknown";
  }
}

function platform(): "web" | "android" | "ios" {
  try {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : "web";
  } catch {
    return "web";
  }
}

/**
 * Record one client event. Fire-and-forget by design: call it, do not await it, and never branch on it.
 */
export function track<N extends ClientEventName>(name: N, ...args: TrackArgs<N>): void {
  try {
    if (sent >= MAX_PER_SESSION) return;
    sent++;
    const [props, seller] = args as unknown as [ClientEvents[N], SellerRef | undefined];
    void send(name, props, seller);
  } catch {
    /* analytics must never throw */
  }
}

/** Call on sign-out: whoever uses this device next starts a fresh, unlinked session. */
export function resetAnalyticsSession(): void {
  try {
    sent = 0;
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — nothing to reset */
  }
}

async function send(name: ClientEventName, props: object, seller: SellerRef | undefined): Promise<void> {
  try {
    const sb = getSupabase();

    // scrubPii walks the object and redacts anything that looks personal. It is a backstop, not a licence to pass
    // personal data in: the typed props above are the real guarantee.
    const safe = scrubValue(props) as Json;

    // user_id is stamped server-side from the JWT (column default) and pinned by the RLS policy. Sending it from here
    // would be both redundant and forgeable, so it is deliberately absent. source must be 'client'; RLS rejects 'db'.
    await sb.from("events").insert({
      name,
      props: safe,
      session_id: sessionId(),
      app_version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null,
      source: "client",
      platform: platform(),
      seller_type: seller?.type ?? null,
      seller_id: seller?.id ?? null,
      actor_role: ACTOR_ROLE[name] ?? "customer",
    });
  } catch {
    /* offline, blocked, pre-migration, RLS — all fine, the event is simply lost */
  }
}
