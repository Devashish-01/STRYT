import { useCallback, useEffect, useState } from "react";
import { notificationService } from "@/services/engagement/notificationService";
import { chatService } from "@/services/engagement/chatService";
import { getSupabase, currentUserId, hasSupabaseEnv } from "@/lib/supabaseClient";

export function useNotificationBadges(isAuthed: boolean) {
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  // Live-update the two global unread badges instead of leaving them frozen
  // at whatever they were when hydratePersonalData last ran. `notifications`
  // and `messages` are both in the supabase_realtime publication.
  useEffect(() => {
    if (!isAuthed || !hasSupabaseEnv) return;
    let active = true;
    let channel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null = null;
    currentUserId().then((uid) => {
      if (!uid || !active) return;
      const sb = getSupabase();
      channel = sb
        .channel(`rt:unread:${uid}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, () => {
          setUnread((n) => n + 1);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
          // Global badge lives on customer surfaces only — count the customer inbox.
          chatService.totalUnread({ scope: "CUSTOMER" }).then((n) => { if (active) setChatUnread(n); });
        })
        .subscribe();
    });
    return () => {
      active = false;
      if (channel) getSupabase().removeChannel(channel);
    };
  }, [isAuthed]);

  const markAllRead = useCallback(() => {
    setUnread(0);
    void notificationService.markAllRead();
  }, []);

  const decrementUnread = useCallback(() => setUnread((n) => Math.max(0, n - 1)), []);

  return { unread, setUnread, markAllRead, decrementUnread, chatUnread, setChatUnread };
}
