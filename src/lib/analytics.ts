// Product analytics — the ten events that say whether a neighbourhood is alive.
//
// STRYT had Sentry and the client_errors sink, both of which answer "what broke". Nothing answered
// "did anyone get a reply to their ask", which is the question that decides whether this product works.
// See supabase/migrations/20260996_product_analytics.sql for the table and the whitelist.
//
// Division of labour, on purpose:
//   * this module reports what only the client knows — a guest browsing before signing up, a shared
//     link being opened, a listing being viewed;
//   * liquidity (answer rate, time to first reply, disputes) is computed from the real tables by the
//     marketplace_health() RPC, because rows cannot be dropped by an offline device or an ad blocker.
// If a number can be counted from the database, it is not tracked here.
//
// Design rules, inherited from monitoring.ts because this runs in ordinary user paths:
//   • NEVER throws and never awaits into a user flow. An analytics failure must be invisible.
//   • Works signed-out. The guest funnel is the point; the events_insert_guest policy allows it.
//   • Sends nothing personal. Every prop goes through scrubPii, the same scrubber behind the
//     client_errors sink and Sentry's beforeSend.
//   • Drops rather than queues forever. A failed send is lost on purpose — an analytics event is not
//     worth retry logic that could outlive the session or grow unbounded.

import { getSupabase } from "./supabaseClient";
import { scrubValue } from "./scrubPii";

declare const __APP_VERSION__: string;

/** Must match the events_name_known CHECK constraint in 20260996. Adding one means a migration. */
export type EventName =
  | "signup_completed"
  | "request_created"
  | "request_viewed"
  | "proposal_created"
  | "proposal_accepted"
  | "booking_created"
  | "deal_completed"
  | "dispute_opened"
  | "review_left"
  | "share_link_opened";

type Props = Record<string, string | number | boolean | null | undefined>;

const MAX_PER_SESSION = 500;
let sent = 0;

/**
 * One id per app session, so a guest's journey can be followed from first screen to signup without
 * knowing who they are. sessionStorage, not localStorage: it must not become a durable identifier —
 * that would turn an anonymous funnel into tracking, which is a different thing entirely and not what
 * anyone consented to.
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

/**
 * Record one product event. Fire-and-forget by design: call it, do not await it, and never branch on
 * it. `props` should be small and categorical (a count, a category id, a boolean) — never a name,
 * phone, address, message body or free text a person typed.
 */
export function track(name: EventName, props: Props = {}): void {
  try {
    if (sent >= MAX_PER_SESSION) return;
    sent++;
    void send(name, props);
  } catch {
    /* analytics must never throw */
  }
}

async function send(name: EventName, props: Props): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;

    // scrubPii walks the object and redacts anything that looks personal. It is a backstop, not a
    // licence to pass personal data in: the caller is still responsible for what it sends.
    const safe = scrubValue(props) as Props;

    // user_id is stamped server-side from the JWT (column default) and pinned by the RLS policy.
    // Sending it from here would be both redundant and forgeable, so it is deliberately absent.
    await sb.from("events").insert({
      name,
      props: safe,
      session_id: sessionId(),
      app_version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null,
    });
  } catch {
    /* offline, blocked, pre-migration, RLS — all fine, the event is simply lost */
  }
}
