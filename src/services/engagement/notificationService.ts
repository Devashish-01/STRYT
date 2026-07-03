import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { AppNotification, NotificationType } from "@/types";
import { config, functionUrl } from "@/config";

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
  };
}

export const notificationService = {
  async list(): Promise<AppNotification[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map(toNotif);
  },

  async getUnreadCount(): Promise<number> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return 0;
    const { count, error } = await sb
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("is_read", false);
    if (error) return 0;
    return count ?? 0;
  },

  async markRead(id: string) {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return { ok: true };
    await sb
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", uid);
    return { ok: true };
  },

  async markAllRead() {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return { ok: true };
    await sb
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", uid)
      .eq("is_read", false);
    return { ok: true };
  },

  async send(userId: string, title: string, body: string, deepLink: string = "", type: NotificationType = "SYSTEM") {
    const sb = getSupabase();
    const { error } = await sb.from("notifications").insert({
      user_id: userId,
      title,
      body,
      deep_link: deepLink,
      type,
    });
    if (error) throw error;
    // Fire-and-forget web push
    void fetch(functionUrl("send-push"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": config.supabaseAnonKey },
      body: JSON.stringify({ userId, title, body, deepLink }),
    }).catch(() => {});
    return { ok: true };
  },

  async sendBulk(userIds: string[], title: string, body: string, deepLink: string = "", type: NotificationType = "SYSTEM") {
    if (userIds.length === 0) return { ok: true };
    const sb = getSupabase();
    const rows = userIds.map((user_id) => ({ user_id, title, body, deep_link: deepLink, type }));
    const { error } = await sb.from("notifications").insert(rows);
    if (error) throw error;
    // Fire-and-forget web push for each recipient (capped at 50)
    for (const userId of userIds.slice(0, 50)) {
      void fetch(functionUrl("send-push"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": config.supabaseAnonKey },
        body: JSON.stringify({ userId, title, body, deepLink }),
      }).catch(() => {});
    }
    return { ok: true };
  },
};
