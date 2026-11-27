import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, currentUserId, hasSupabaseEnv } from "@/lib/supabaseClient";
import { chatService } from "@/services/engagement/chatService";
import { notificationService, classifyNotificationScope, type ClassifiedNotifScope } from "@/services/engagement/notificationService";
import { invalidateQueryCacheByPrefix } from "@/hooks/useApi";

export interface LiveNotificationAlert {
  id: string;
  title: string;
  body: string;
  deepLink: string;
  type: string;
  scope: ClassifiedNotifScope["scope"];
  entityId?: string;
}

const ALERT_TTL_MS = 5500;
const DEDUP_WINDOW_MS = 4500;

export function normalizeAlert(raw: {
  id?: string | null;
  title?: string | null;
  body?: string | null;
  deep_link?: string | null;
  deepLink?: string | null;
  url?: string | null;
  type?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
}): LiveNotificationAlert | null {
  const title = (raw.title ?? "").trim();
  const body = (raw.body ?? "").trim();
  if (!title && !body) return null;
  const deepLink = (raw.deep_link ?? raw.deepLink ?? raw.url ?? "/notifications").trim() || "/notifications";
  const type = String(raw.type ?? "SYSTEM");
  const classified = classifyNotificationScope({
    type,
    deep_link: deepLink,
    entity_type: raw.entity_type,
    entity_id: raw.entity_id,
  });
  return {
    id: raw.id ? String(raw.id) : `push:${Date.now()}`,
    title: title || "Notification",
    body,
    deepLink,
    type,
    scope: classified.scope,
    entityId: "id" in classified ? classified.id : undefined,
  };
}

/**
 * Maintains global realtime unread badges (chat + ALL notification scopes:
 * Personal, Business, Provider, Delivery) and surfaces a live foreground
 * notification banner whenever a new notification or push arrives.
 */
export function useNotificationBadges(isAuthed: boolean) {
  const [chatUnread, setChatUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [liveAlert, setLiveAlert] = useState<LiveNotificationAlert | null>(null);

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const recentFingerprintsRef = useRef<Map<string, number>>(new Map());

  const dismissLiveAlert = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setLiveAlert(null);
  }, []);

  const surfaceAlert = useCallback((alert: LiveNotificationAlert | null) => {
    if (!alert) return;
    if (seenIdsRef.current.has(alert.id)) return;

    const fingerprint = `${alert.type}|${alert.title}|${alert.body}|${alert.deepLink}`;
    const now = Date.now();
    for (const [k, ts] of recentFingerprintsRef.current.entries()) {
      if (now - ts > DEDUP_WINDOW_MS) recentFingerprintsRef.current.delete(k);
    }
    const lastTs = recentFingerprintsRef.current.get(fingerprint);
    if (lastTs !== undefined && now - lastTs < DEDUP_WINDOW_MS) return;

    seenIdsRef.current.add(alert.id);
    if (seenIdsRef.current.size > 100) {
      const oldest = seenIdsRef.current.values().next().value;
      if (oldest) seenIdsRef.current.delete(oldest);
    }
    recentFingerprintsRef.current.set(fingerprint, now);

    // Don't float a banner while already standing on the Notifications inbox itself.
    if (typeof window !== "undefined" && window.location.pathname === "/notifications") return;

    setLiveAlert(alert);
    try {
      if (typeof navigator !== "undefined" && (navigator.userActivation?.hasBeenActive ?? true)) {
        navigator.vibrate?.(18);
      }
    } catch { /* unsupported */ }

    if (dismissTimerRef.current !== null) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setLiveAlert(null), ALERT_TTL_MS);
  }, []);

  const refreshBadges = useCallback(async () => {
    if (!hasSupabaseEnv || !isAuthed) return;
    await Promise.allSettled([
      notificationService.getUnreadCount().then((n) => setNotifUnread(n)),
      chatService.totalUnread({ scope: "CUSTOMER" }).then((n) => setChatUnread(n)),
    ]);
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed || !hasSupabaseEnv) {
      setNotifUnread(0);
      setChatUnread(0);
      dismissLiveAlert();
      return;
    }

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null = null;

    const syncAll = () => {
      if (!active) return;
      invalidateQueryCacheByPrefix("notif:");
      notificationService.getUnreadCount().then((n) => { if (active) setNotifUnread(n); }).catch(() => {});
      chatService.totalUnread({ scope: "CUSTOMER" }).then((n) => { if (active) setChatUnread(n); }).catch(() => {});
    };

    syncAll();

    currentUserId().then((uid) => {
      if (!uid || !active) return;
      const sb = getSupabase();

      const subscribe = () => {
        if (!active) return;
        const suffix = Math.random().toString(36).slice(2, 8);
        const nextChannel = sb
          .channel(`rt:unread:${uid}:${suffix}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
            chatService.totalUnread({ scope: "CUSTOMER" }).then((n) => { if (active) setChatUnread(n); }).catch(() => {});
          })
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
            (payload: any) => {
              if (!active) return;
              invalidateQueryCacheByPrefix("notif:");
              notificationService.getUnreadCount().then((n) => { if (active) setNotifUnread(n); }).catch(() => {});

              if (payload?.eventType === "INSERT" && payload.new) {
                const row = payload.new as Record<string, any>;
                if (row.type === "DELIVERY" || String(row.deep_link ?? "").startsWith("/delivery")) {
                  invalidateQueryCacheByPrefix("delivery:");
                } else if (row.entity_type === "BUSINESS" && row.entity_id) {
                  invalidateQueryCacheByPrefix(`business:${row.entity_id}:`);
                } else if (row.entity_type === "PROVIDER" && row.entity_id) {
                  invalidateQueryCacheByPrefix(`provider:${row.entity_id}:`);
                }
                surfaceAlert(normalizeAlert(row));
              }
            },
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              sb.removeChannel(nextChannel);
              if (channel === nextChannel) channel = null;
              if (active) {
                syncAll();
                retryTimer = setTimeout(subscribe, 4000);
              }
            }
          });
        channel = nextChannel;
      };

      subscribe();
    });

    const onPushReceived = (e: Event) => {
      if (!active) return;
      const detail = (e as CustomEvent<Record<string, unknown>>).detail ?? {};
      syncAll();
      surfaceAlert(normalizeAlert(detail));
    };

    const onSwMessage = (e: MessageEvent) => {
      if (!active || e.data?.type !== "PUSH_RECEIVED") return;
      syncAll();
      surfaceAlert(normalizeAlert(e.data));
    };

    const onWake = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        syncAll();
      }
    };

    window.addEventListener("push-received", onPushReceived);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    // Light safety net every 45s while visible so a silently sleeping mobile WebSocket recovers quickly.
    const poll = setInterval(() => {
      if (active && typeof document !== "undefined" && document.visibilityState === "visible") {
        syncAll();
      }
    }, 45_000);

    return () => {
      active = false;
      clearInterval(poll);
      if (retryTimer !== null) clearTimeout(retryTimer);
      window.removeEventListener("push-received", onPushReceived);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      if (channel) getSupabase().removeChannel(channel);
    };
  }, [isAuthed, dismissLiveAlert, surfaceAlert]);

  useEffect(() => dismissLiveAlert, [dismissLiveAlert]);

  return { chatUnread, setChatUnread, notifUnread, refreshBadges, liveAlert, dismissLiveAlert };
}
