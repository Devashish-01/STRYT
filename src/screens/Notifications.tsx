import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Store, Briefcase, MessageSquareText, FileText, HandshakeIcon, Tag, Bell, Users, PartyPopper, Megaphone, MapPin, MessageCircle, Flag, Search, BadgeCheck, Clock } from "@/components/Icons";
import { notificationService } from "@/services";
import type { NotifScope } from "@/services/engagement/notificationService";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { AppBar, EmptyState, PullToRefreshIndicator } from "@/components/common";
import { NoNotificationsIllustration } from "@/components/illustrations";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import NotificationRow from "@/components/NotificationRow";
import { useApp } from "@/store";
import type { NotificationType, AppNotification } from "@/types";

const Handshake = HandshakeIcon as any;

const meta: Record<NotificationType, { icon: any; color: string; bg: string }> = {
  NEW_BUSINESS: { icon: Store, color: "var(--orange-500)", bg: "var(--orange-50)" },
  NEW_PROVIDER: { icon: Briefcase, color: "var(--green-500)", bg: "var(--green-100)" },
  NEARBY_REQUEST: { icon: MessageSquareText, color: "var(--brand-700)", bg: "var(--brand-100)" },
  PROPOSAL: { icon: FileText, color: "var(--blue-500)", bg: "var(--ink-100)" },
  AGREEMENT: { icon: Handshake, color: "var(--green-500)", bg: "var(--green-100)" },
  OFFER: { icon: Tag, color: "var(--pink-500)", bg: "var(--ink-50)" },
  ME_TOO: { icon: Users, color: "var(--green-500)", bg: "var(--green-100)" },
  GROUP_BUY_UNLOCKED: { icon: PartyPopper, color: "var(--orange-500)", bg: "var(--orange-50)" },
  QUOTE_BROADCAST: { icon: Megaphone, color: "var(--brand-400)", bg: "var(--brand-100)" },
  LOCATION_REQUEST: { icon: MapPin, color: "var(--brand-700)", bg: "var(--brand-100)" },
  LOCATION_APPROVED: { icon: MapPin, color: "var(--green-500)", bg: "var(--green-100)" },
  COMMUNITY_COMMENT: { icon: MessageCircle, color: "var(--brand-700)", bg: "var(--brand-100)" },
  REPORT_RESOLVED: { icon: Flag, color: "var(--ink-600)", bg: "var(--ink-100)" },
  STORY_REACTION: { icon: PartyPopper, color: "var(--pink-500)", bg: "var(--ink-50)" },
  SAVED_SEARCH_MATCH: { icon: Search, color: "var(--blue-500)", bg: "var(--ink-100)" },
  VERIFICATION_DECIDED: { icon: BadgeCheck, color: "var(--green-500)", bg: "var(--green-100)" },
  QUEUE_UPDATE: { icon: Users, color: "var(--blue-500)", bg: "var(--ink-100)" },
  APPOINTMENT: { icon: Clock, color: "var(--brand-600)", bg: "var(--brand-50)" },
  BUSINESS_ACCESS: { icon: Users, color: "var(--orange-500)", bg: "var(--orange-50)" },
  SYSTEM: { icon: Bell, color: "var(--ink-600)", bg: "var(--ink-100)" },
};

function iconFor(n: AppNotification) {
  // "It's your turn" is the single highest-urgency notification the app
  // sends — it means a customer's spot is about to expire — so it gets a
  // distinct green/bell treatment instead of the generic Users/blue every
  // other queue update shares.
  const isYourTurn = n.type === "QUEUE_UPDATE" && n.title.startsWith("It's your turn");
  return isYourTurn ? { icon: Bell, color: "var(--green-600)", bg: "var(--green-100)" } : (meta[n.type] ?? meta.SYSTEM);
}

type Section = { label: string; items: AppNotification[] };

/** Groups by calendar day (Today / Yesterday / an older weekday or date) —
 *  the same at-a-glance structure iOS/WhatsApp notification lists use so a
 *  long list doesn't read as one undifferentiated wall of rows. */
function groupByDay(items: AppNotification[]): Section[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const yesterday = today - 86_400_000;
  const sections = new Map<string, AppNotification[]>();

  for (const n of items) {
    const created = new Date(n.createdAt);
    const day = startOfDay(created);
    const label =
      day === today ? "Today"
      : day === yesterday ? "Yesterday"
      : day > today - 6 * 86_400_000 ? created.toLocaleDateString("en-IN", { weekday: "long" })
      : created.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
    if (!sections.has(label)) sections.set(label, []);
    sections.get(label)!.push(n);
  }
  return Array.from(sections, ([label, items]) => ({ label, items }));
}

export default function Notifications() {
  const nav = useNavigate();
  const { markAllRead, decrementUnread, showToast } = useApp();
  const [params] = useSearchParams();

  // Scope the feed to the context that opened it: a specific business, a
  // specific provider, or the customer's personal + system notifications.
  const rawScope = params.get("scope");
  const scope: NotifScope | undefined =
    rawScope === "BUSINESS" ? { scope: "BUSINESS", id: params.get("id") ?? "" }
    : rawScope === "PROVIDER" ? { scope: "PROVIDER", id: params.get("id") ?? "" }
    : rawScope === "CUSTOMER" ? { scope: "CUSTOMER" }
    : undefined;
  const scopeKey = `${rawScope ?? "all"}:${params.get("id") ?? ""}`;
  const subtitle = scope?.scope === "BUSINESS" ? "For this business"
    : scope?.scope === "PROVIDER" ? "For this service"
    : scope?.scope === "CUSTOMER" ? "Personal" : undefined;

  const { data, loading, error, refetch } = useQueryWithRealtime(() => notificationService.list(scope), "notifications", [scopeKey]);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(refetch);

  const sections = useMemo(() => groupByDay(items), [items]);
  const hasUnread = items.some((n) => !n.isRead);

  function open(n: AppNotification) {
    if (!n.isRead) decrementUnread();
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    void notificationService.markRead(n.id);
    if (n.deepLink) nav(n.deepLink);
  }

  // Optimistic remove with a brief collapse animation, reverting + toasting
  // if the delete fails server-side (design-principles §6: optimistic +
  // revert + toast for every write).
  function remove(n: AppNotification) {
    setExitingIds((s) => new Set(s).add(n.id));
    setTimeout(() => {
      setItems((p) => p.filter((x) => x.id !== n.id));
      setExitingIds((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
    }, 220);
    if (!n.isRead) decrementUnread();
    notificationService.remove(n.id).catch(() => {
      setItems((p) => (p.some((x) => x.id === n.id) ? p : [...p, n]));
      if (!n.isRead) {
        // decrementUnread has no inverse; a refetch resyncs the badge count.
        refetch();
      }
      showToast("Couldn't delete — try again");
    });
  }

  return (
    <div className="screen screen-boxed">
      <AppBar
        title="Notifications"
        subtitle={subtitle}
        right={
          hasUnread ? (
            <button
              className="tiny semi"
              style={{ color: "var(--brand-700)" }}
              onClick={() => {
                setItems((p) => p.map((n) => ({ ...n, isRead: true })));
                markAllRead();
                void notificationService.markAllRead(scope);
              }}
            >
              Mark all read
            </button>
          ) : undefined
        }
      />
      <div ref={containerRef} className="screen-scroll">
        <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} threshold={threshold} />
        {loading ? (
          <ListSkeleton count={4} />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : items.length === 0 ? (
          <EmptyState illustration={<NoNotificationsIllustration />} emoji="🔔" title="All caught up" text="New activity nearby will show up here." />
        ) : (
          <div>
            {sections.map((section) => (
              <div key={section.label}>
                <div className="notif-section-label">{section.label}</div>
                {section.items.map((n, i) => {
                  const M = iconFor(n);
                  const Icon = M.icon;
                  const isYourTurn = n.type === "QUEUE_UPDATE" && n.title.startsWith("It's your turn");
                  return (
                    <div
                      key={n.id}
                      className={exitingIds.has(n.id) ? "notif-row-exit" : "notif-row-enter"}
                      style={{ animationDelay: exitingIds.has(n.id) ? undefined : `${Math.min(i, 8) * 30}ms` }}
                    >
                      <NotificationRow
                        icon={<Icon size={20} color={M.color} />}
                        iconBg={M.bg}
                        iconColor={M.color}
                        title={n.title}
                        unread={!n.isRead}
                        preview={n.body}
                        time={n.time}
                        urgent={isYourTurn}
                        metadata={n.metadata}
                        onOpen={() => open(n)}
                        onDelete={() => remove(n)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
