import { useEffect, useState } from "react";
import { chatService } from "@/services/engagement/chatService";
import { getSupabase, currentUserId, hasSupabaseEnv } from "@/lib/supabaseClient";

export function useNotificationBadges(isAuthed: boolean) {
  const [chatUnread, setChatUnread] = useState(0);

  // Live-update the global chat unread badge instead of leaving it frozen at
  // whatever hydratePersonalData last set it to. `messages` is in the
  // supabase_realtime publication. (Notification unread counts are handled
  // per-surface by each screen's own scoped query — see Notifications.tsx /
  // ManageDashboard.tsx / ProviderDashboard.tsx — not by a single global badge
  // here, since a global "customer-only" count doesn't distinguish which of
  // a user's business/provider/customer hats got the notification.)
  useEffect(() => {
    if (!isAuthed || !hasSupabaseEnv) return;
    let active = true;
    let channel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null = null;
    currentUserId().then((uid) => {
      if (!uid || !active) return;
      const sb = getSupabase();
      channel = sb
        .channel(`rt:unread:${uid}`)
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

  return { chatUnread, setChatUnread };
}
