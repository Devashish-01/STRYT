import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Store, Briefcase, MessageSquareText, FileText, HandshakeIcon, Tag, Bell } from "lucide-react";
import { notificationService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { AppBar, EmptyState } from "@/components/common";
import { useApp } from "@/store";
import type { NotificationType, AppNotification } from "@/types";

const Handshake = HandshakeIcon as any;

const meta: Record<NotificationType, { icon: any; color: string; bg: string }> = {
  NEW_BUSINESS: { icon: Store, color: "#f26a00", bg: "#fff3e8" },
  NEW_PROVIDER: { icon: Briefcase, color: "#16a34a", bg: "#e8f7ee" },
  NEARBY_REQUEST: { icon: MessageSquareText, color: "#6b21cc", bg: "#f3ecff" },
  PROPOSAL: { icon: FileText, color: "#0ea5e9", bg: "#e6f5fe" },
  AGREEMENT: { icon: Handshake, color: "#16a34a", bg: "#e8f7ee" },
  OFFER: { icon: Tag, color: "#ec4899", bg: "#fdeef6" },
  SYSTEM: { icon: Bell, color: "#5c5573", bg: "#f1eef8" },
};

export default function Notifications() {
  const nav = useNavigate();
  const { markAllRead, decrementUnread } = useApp();
  const { data, loading, error, refetch } = useQuery(() => notificationService.list(), []);
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  return (
    <div className="screen">
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
          <EmptyState emoji="🔔" title="All caught up" text="New activity nearby will show up here." />
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
