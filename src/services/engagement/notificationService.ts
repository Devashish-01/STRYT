import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { AppNotification, NotificationType, NotificationMetadata } from "@/types";

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); // minutes
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  const h = Math.floor(d / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function toNotif(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    type: row.type as NotificationType,
    title: row.title as string,
    body: row.body as string,
    deepLink: row.deep_link as string,
    isRead: row.is_read as boolean,
    time: relDate(row.created_at as string),
    createdAt: row.created_at as string,
    metadata: (row.metadata as AppNotification["metadata"]) ?? null,
  };
}

/** Which context's notifications to show. CUSTOMER also includes legacy/system
 *  rows that have no scope. Omit entirely for the unfiltered "everything" view. */
export type NotifScope = { scope: "CUSTOMER" | "BUSINESS" | "PROVIDER"; id?: string };

function applyScope(q: any, scope?: NotifScope) {
  if (!scope) return q;
  if (scope.scope === "BUSINESS" || scope.scope === "PROVIDER") {
    return q.eq("entity_type", scope.scope).eq("entity_id", scope.id ?? "");
  }
  // CUSTOMER: personal + legacy rows that predate scoping.
  return q.or("entity_type.is.null,entity_type.eq.CUSTOMER");
}

const HANDLED_BOOKING: Record<string, { statusPill: string; tone: string }> = {
  ACCEPTED: { statusPill: "Confirmed", tone: "success" },
  REJECTED: { statusPill: "Declined", tone: "danger" },
  CANCELLED: { statusPill: "Cancelled", tone: "danger" },
  COMPLETED: { statusPill: "Completed", tone: "success" },
  NO_SHOW: { statusPill: "No-show", tone: "danger" },
};

/**
 * A booking request notification keeps its Accept/Decline buttons in its stored metadata forever, so once the
 * booking was handled anywhere else (the console, another device, a teammate) the buttons stayed and tapping them
 * failed with INVALID_TRANSITION (E2E-007). This looks up the live status of those bookings in one query and shows
 * handled ones as handled. Best effort: if the lookup fails the list is returned unchanged.
 */
async function reconcileBookingActions(sb: ReturnType<typeof getSupabase>, items: AppNotification[]): Promise<AppNotification[]> {
  const pending = items.filter((n) => {
    const actions = (n.metadata?.actions ?? []) as string[];
    return !!n.metadata?.appointmentId && (actions.includes("ACCEPT") || actions.includes("DECLINE"));
  });
  if (pending.length === 0) return items;
  const ids = Array.from(new Set(pending.map((n) => String(n.metadata!.appointmentId))));
  const { data, error } = await sb.from("appointments").select("id, status").in("id", ids);
  if (error || !data) return items;
  const statusById = new Map(data.map((a: { id: string; status: string }) => [a.id, a.status]));
  return items.map((n) => {
    const status = n.metadata?.appointmentId ? statusById.get(String(n.metadata.appointmentId)) : undefined;
    const handled = status ? HANDLED_BOOKING[status] : undefined;
    if (!handled || !pending.includes(n)) return n;
    return { ...n, metadata: { ...n.metadata, ...handled, actions: [] } } as AppNotification;
  });
}

export const notificationService = {
  async list(scope?: NotifScope): Promise<AppNotification[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    let q = sb.from("notifications").select("*").eq("user_id", uid);
    q = applyScope(q, scope);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return reconcileBookingActions(sb, (data ?? []).map(toNotif));
  },

  async getUnreadCount(scope?: NotifScope): Promise<number> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return 0;
    let q = sb.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("is_read", false);
    q = applyScope(q, scope);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  },

  // Throws on failure (like remove() below) rather than swallowing the error.
  // Silently discarding it meant a mark-read that never persisted looked
  // identical to one that did — the row's unread dot came back on the next
  // refetch with nothing explaining why.
  async markRead(id: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return { ok: true };
    const { error } = await sb
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return { ok: true };
  },

  async markAllRead(scope?: NotifScope) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return { ok: true };
    let q = sb.from("notifications").update({ is_read: true }).eq("user_id", uid).eq("is_read", false);
    q = applyScope(q, scope);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  },

  // Client-side dismissal (swipe-to-delete). RLS's delete_own_notifications
  // policy (20260813_notification_rls.sql) already scopes this to the
  // caller's own rows at the DB level — the .eq("user_id", uid) here is
  // defense in depth, not the actual boundary.
  async remove(id: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return { ok: true };
    const { error } = await sb.from("notifications").delete().eq("id", id).eq("user_id", uid);
    if (error) throw error;
    return { ok: true };
  },

  // Push is fired by a database trigger on the notifications table itself
  // (supabase/migrations/20260731_push_on_every_notification.sql), so simply
  // inserting the row delivers the OS-level push too — no separate fetch()
  // here, which would double-push. That single trigger also covers every
  // notification created by Postgres triggers (proposals, agreements, nearby
  // requests, community, etc.), which never had a push path before.
  // Only the recipient themselves or an admin may insert (20260980, E2E-040); anything addressed to someone else goes
  // through a server function that checks the sender's right to send it.
  async send(
    userId: string,
    title: string,
    body: string,
    deepLink: string = "",
    type: NotificationType = "SYSTEM",
    metadata?: NotificationMetadata | null,
    entity_type?: string | null,
    entity_id?: string | null
  ) {
    const sb = getSupabase();
    const { error } = await sb.from("notifications").insert({
      user_id: userId,
      title,
      body,
      deep_link: deepLink,
      type,
      metadata: metadata ?? null,
      entity_type: entity_type ?? null,
      entity_id: entity_id ?? null,
    });
    if (error) throw error;
    return { ok: true };
  },

  async sendBulk(
    userIds: string[],
    title: string,
    body: string,
    deepLink: string = "",
    type: NotificationType = "SYSTEM",
    metadata?: NotificationMetadata | null,
    entity_type?: string | null,
    entity_id?: string | null
  ) {
    if (userIds.length === 0) return { ok: true };
    const sb = getSupabase();
    const rows = userIds.map((user_id) => ({
      user_id,
      title,
      body,
      deep_link: deepLink,
      type,
      metadata: metadata ?? null,
      entity_type: entity_type ?? null,
      entity_id: entity_id ?? null,
    }));
    const { error } = await sb.from("notifications").insert(rows);
    if (error) throw error;
    return { ok: true };
  },

  /** "Request payment" from a shop, provider or their team. The server checks the caller manages the booking, queue
   *  visit or agreement, that payment is still owed, and the cooldown (10 min; 6 h for agreements), and writes the
   *  text itself. */
  async requestPaymentNudge(kind: PaymentNudgeKind, id: string) {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("request_payment_nudge", { p_kind: kind, p_id: id });
    if (error) {
      const code = String(error.message ?? "");
      const message = code.includes("NUDGE_COOLDOWN")
        ? `A payment reminder was already sent in the last ${kind === "AGREEMENT" ? "6 hours" : "10 minutes"}.`
        : code.includes("ALREADY_PAID")
          ? "This is already paid."
          : code.includes("NO_CUSTOMER")
            ? "No customer account is linked to this entry."
            : code.includes("NOT_ALLOWED")
              ? "Only the business or provider handling this can request payment."
              : code.includes("NOT_FOUND")
                ? "This entry no longer exists."
                : "Couldn't send the payment reminder. Try again.";
      throw new Error(message);
    }
    return { ok: true };
  },
};

export type PaymentNudgeKind = "APPOINTMENT" | "QUEUE" | "AGREEMENT";
