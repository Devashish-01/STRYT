import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Store, Briefcase, MessageSquareText, FileText, HandshakeIcon, Tag, Bell, Users, PartyPopper, Megaphone, MapPin, MessageCircle, Flag, Search, BadgeCheck } from "@/components/Icons";
import { notificationService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { AppBar, EmptyState } from "@/components/common";
import { NoNotificationsIllustration } from "@/components/illustrations";
import { useApp } from "@/store";
import type { NotificationType, AppNotification } from "@/types";

const Handshake = HandshakeIcon as any;

const meta: Record<NotificationType, { icon: any; color: string; bg: string }> = {
  NEW_BUSINESS: { icon: Store, color: "var(--orange-500)", bg: "var(--orange-50)" },
  NEW_PROVIDER: { icon: Briefcase, color: "var(--green-500)", bg: "var(--green-100)" },
  NEARBY_REQUEST: { icon: MessageSquareText, color: "var(--brand-700)", bg: "var(--brand-100)" },
  PROPOSAL: { icon: FileText, color: "var(--blue-500)", bg: "var(--ink-100)" },
  AGREEMENT: { icon: Handshake, color: "var(--green-500)", bg: "var(--green-100)" },
  OFFER: { icon: Tag, color: "#ec4899", bg: "var(--ink-50)" },
  ME_TOO: { icon: Users, color: "var(--green-500)", bg: "var(--green-100)" },
  GROUP_BUY_UNLOCKED: { icon: PartyPopper, color: "var(--orange-500)", bg: "var(--orange-50)" },
  QUOTE_BROADCAST: { icon: Megaphone, color: "var(--brand-400)", bg: "var(--brand-100)" },
  LOCATION_REQUEST: { icon: MapPin, color: "var(--brand-700)", bg: "var(--brand-100)" },
  LOCATION_APPROVED: { icon: MapPin, color: "var(--green-500)", bg: "var(--green-100)" },
  COMMUNITY_COMMENT: { icon: MessageCircle, color: "var(--brand-700)", bg: "var(--brand-100)" },
  REPORT_RESOLVED: { icon: Flag, color: "var(--ink-600)", bg: "var(--ink-100)" },
  STORY_REACTION: { icon: PartyPopper, color: "#ec4899", bg: "var(--ink-50)" },
  SAVED_SEARCH_MATCH: { icon: Search, color: "var(--blue-500)", bg: "var(--ink-100)" },
  VERIFICATION_DECIDED: { icon: BadgeCheck, color: "var(--green-500)", bg: "var(--green-100)" },
  SYSTEM: { icon: Bell, color: "var(--ink-600)", bg: "var(--ink-100)" },
};

export default function Notifications() {
  const nav = useNavigate();
  const { markAllRead, decrementUnread } = useApp();
  const { data, loading, error, refetch } = useQueryWithRealtime(() => notificationService.list(), "notifications", []);
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  return (
    <div className="screen screen-boxed">
      <AppBar
        title="Notifications"
        right={
          <button
            className="tiny semi"
            style={{ color: "var(--brand-700)" }}
            onClick={() => {
              setItems((p) => p.map((n) => ({ ...n, isRead: true })));
              markAllRead();
              void notificationService.markAllRead();
            }}
          >
            Mark all read
          </button>
        }
      />
      <div className="screen-scroll">
        {loading ? (
          <ListSkeleton count={4} />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : items.length === 0 ? (
          <EmptyState illustration={<NoNotificationsIllustration />} emoji="🔔" title="All caught up" text="New activity nearby will show up here." />
        ) : (
          <div className="col">
            {items.map((n) => {
              const M = meta[n.type];
              const Icon = M.icon;
              return (
                <button
                  key={n.id}
                  className="row gap-12"
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--line)",
                    background: n.isRead ? "transparent" : "var(--brand-50)",
                    textAlign: "left",
                  }}
                  onClick={() => {
                    if (!n.isRead) decrementUnread();
                    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
                    void notificationService.markRead(n.id);
                    if (n.deepLink) nav(n.deepLink);
                  }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: M.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={20} color={M.color} />
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row between">
                      <span className="semi small">{n.title}</span>
                      {!n.isRead && <span className="dot-new" />}
                    </div>
                    <p className="tiny muted" style={{ marginTop: 2, lineHeight: 1.4 }}>{n.body}</p>
                    <span className="tiny" style={{ color: "var(--ink-400)" }}>{n.time}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
