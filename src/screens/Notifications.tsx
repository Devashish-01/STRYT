import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Store, Briefcase, MessageSquareText, FileText, HandshakeIcon, Tag, Bell, Users, PartyPopper, Megaphone, MapPin, MessageCircle, Flag, Search, BadgeCheck, Clock, Package, Heart, Sparkles, CheckCircle2, ChartBar, At, Mountains, Star, Ticket, Wallet, Shield } from "@/components/Icons";
import { notificationService, appointmentService, deliveryService, bulkService, locationService, customPaymentService, walletService, requestService } from "@/services";
import { openCalendarEvent } from "@/lib/calendarExport";
import { NOTIFICATION_PAGE_SIZE, type NotifScope } from "@/services/engagement/notificationService";
import { useQueryWithRealtime, invalidateQueryCache } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { AppBar, EmptyState, PullToRefreshIndicator } from "@/components/common";
import { NoNotificationsIllustration } from "@/components/illustrations";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import NotificationRow from "@/components/NotificationRow";
import { useApp } from "@/store";
import type { NotificationType, AppNotification } from "@/types";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { openExternal } from "@/lib/openExternal";

const Handshake = HandshakeIcon as any;

const meta: Record<NotificationType, { icon: any; color: string; bg: string }> = {
  NEW_BUSINESS: { icon: Store, color: "var(--orange-500)", bg: "var(--orange-50)" },
  // Admin-only: something is waiting in the review queue (20260933).
  ADMIN_REVIEW_QUEUE: { icon: Shield, color: "var(--amber-700)", bg: "var(--amber-50)" },
  NEW_PROVIDER: { icon: Briefcase, color: "var(--green-500)", bg: "var(--green-100)" },
  NEW_PLACE: { icon: Mountains, color: "var(--brand-700)", bg: "var(--brand-100)" },
  NEARBY_REQUEST: { icon: MessageSquareText, color: "var(--brand-700)", bg: "var(--brand-100)" },
  PROPOSAL: { icon: FileText, color: "var(--blue-500)", bg: "var(--ink-100)" },
  AGREEMENT: { icon: Handshake, color: "var(--green-500)", bg: "var(--green-100)" },
  OFFER: { icon: Tag, color: "var(--pink-500)", bg: "var(--ink-50)" },
  ME_TOO: { icon: Users, color: "var(--green-500)", bg: "var(--green-100)" },
  GROUP_BUY_UNLOCKED: { icon: PartyPopper, color: "var(--orange-500)", bg: "var(--orange-50)" },
  QUOTE_BROADCAST: { icon: Megaphone, color: "var(--brand-400)", bg: "var(--brand-100)" },
  LOCATION_REQUEST: { icon: MapPin, color: "var(--brand-700)", bg: "var(--brand-100)" },
  LOCATION_APPROVED: { icon: MapPin, color: "var(--green-500)", bg: "var(--green-100)" },
  LOCATION_DENIED: { icon: MapPin, color: "var(--red-500)", bg: "var(--red-50)" },
  LOCATION_REVOKED: { icon: MapPin, color: "var(--ink-600)", bg: "var(--ink-100)" },
  COMMUNITY_COMMENT: { icon: MessageCircle, color: "var(--brand-700)", bg: "var(--brand-100)" },
  COMMUNITY_LIKE: { icon: Heart, color: "var(--red-500)", bg: "var(--red-50)" },
  COMMUNITY_RECOMMENDATION: { icon: Sparkles, color: "var(--green-500)", bg: "var(--green-100)" },
  COMMUNITY_RESOLVED: { icon: CheckCircle2, color: "var(--green-600)", bg: "var(--green-100)" },
  COMMUNITY_POLL_ENDED: { icon: ChartBar, color: "var(--blue-500)", bg: "var(--blue-100)" },
  COMMUNITY_MENTION: { icon: At, color: "var(--brand-700)", bg: "var(--brand-100)" },
  // Same family as COMMUNITY_COMMENT but a distinct icon — a direct reply is a
  // different (and more personal) event than a comment on your post.
  COMMUNITY_REPLY: { icon: MessageSquareText, color: "var(--brand-700)", bg: "var(--brand-100)" },
  COMMUNITY_COMMENT_REACTION: { icon: Heart, color: "var(--pink-500)", bg: "var(--ink-50)" },
  // Red on purpose: this is the one community notification that arrives
  // unrequested, so it has to read as "something is happening near you" and not
  // as another engagement ping.
  NEARBY_ALERT: { icon: Megaphone, color: "var(--red-600)", bg: "var(--red-100)" },
  REPORT_RESOLVED: { icon: Flag, color: "var(--ink-600)", bg: "var(--ink-100)" },
  STORY_REACTION: { icon: PartyPopper, color: "var(--pink-500)", bg: "var(--ink-50)" },
  SAVED_SEARCH_MATCH: { icon: Search, color: "var(--blue-500)", bg: "var(--ink-100)" },
  VERIFICATION_DECIDED: { icon: BadgeCheck, color: "var(--green-500)", bg: "var(--green-100)" },
  QUEUE_UPDATE: { icon: Users, color: "var(--blue-500)", bg: "var(--ink-100)" },
  APPOINTMENT: { icon: Clock, color: "var(--brand-600)", bg: "var(--brand-50)" },
  DELIVERY: { icon: Package, color: "var(--delivery-600)", bg: "var(--delivery-50)" },
  BUSINESS_ACCESS: { icon: Users, color: "var(--orange-500)", bg: "var(--orange-50)" },
  PROPOSAL_COUNTER: { icon: FileText, color: "var(--blue-500)", bg: "var(--ink-100)" },
  RATING: { icon: Star, color: "var(--amber-500)", bg: "var(--amber-50)" },
  RATING_REPLY: { icon: Star, color: "var(--amber-500)", bg: "var(--amber-50)" },
  BULK_DEAL_PLEDGE: { icon: Package, color: "var(--orange-500)", bg: "var(--orange-50)" },
  BULK_DEAL_DEPOSIT_CLAIMED: { icon: Package, color: "var(--amber-500)", bg: "var(--amber-50)" },
  BULK_DEAL_DEPOSIT_CONFIRMED: { icon: Package, color: "var(--green-500)", bg: "var(--green-100)" },
  BULK_DEAL_DEPOSIT_REJECTED: { icon: Package, color: "var(--red-500)", bg: "var(--red-50)" },
  // Ticket, not Package — this one means "your claim pass is ready", which is
  // the same object the pass modal and the Activity header icon already use.
  BULK_DEAL_UNLOCKED: { icon: Ticket, color: "var(--green-600)", bg: "var(--green-100)" },
  BULK_DEAL_REFUNDED: { icon: Package, color: "var(--ink-600)", bg: "var(--ink-100)" },
  BULK_DEAL_EXTENDED: { icon: Clock, color: "var(--amber-700)", bg: "var(--amber-50)" },
  LIVE_LOCATION: { icon: MapPin, color: "var(--accent-600)", bg: "var(--amber-100)" },
  CUSTOM_PAYMENT_RECEIVED: { icon: Wallet, color: "var(--amber-600)", bg: "var(--amber-50)" },
  CUSTOM_PAYMENT_CONFIRMED: { icon: Wallet, color: "var(--green-500)", bg: "var(--green-100)" },
  CUSTOM_PAYMENT_REJECTED: { icon: Wallet, color: "var(--red-500)", bg: "var(--red-50)" },
  QNA: { icon: MessageCircle, color: "var(--brand-700)", bg: "var(--brand-100)" },
  CHAT: { icon: MessageCircle, color: "var(--brand-700)", bg: "var(--brand-100)" },
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
 *  long list doesn't read as one undifferentiated wall of rows. Weekday/date
 *  labels use the viewer's own language locale (via formatDate's
 *  LOCALE_BY_LANG), not a hardcoded "en-IN" — a Hindi/Marathi reader gets
 *  weekday names in their own script, not just the Today/Yesterday labels. */
function groupByDay(items: AppNotification[], lang: string, todayLabel: string, yesterdayLabel: string): Section[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const yesterday = today - 86_400_000;
  const sections = new Map<string, AppNotification[]>();

  for (const n of items) {
    const created = new Date(n.createdAt);
    const day = startOfDay(created);
    const label =
      day === today ? todayLabel
      : day === yesterday ? yesterdayLabel
      : day > today - 6 * 86_400_000 ? formatDate(n.createdAt, lang, { weekday: "long" })
      : formatDate(n.createdAt, lang, { day: "numeric", month: "short", year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
    if (!sections.has(label)) sections.set(label, []);
    sections.get(label)!.push(n);
  }
  return Array.from(sections, ([label, items]) => ({ label, items }));
}

export default function Notifications() {
  const nav = useNavigate();
  const { showToast, user } = useApp();
  const { t, lang } = useI18n();
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
  // Same cache-key convention the origin screen's own unread-count query uses
  // (Home.tsx/Profile.tsx "notif:customer", ManageDashboard.tsx
  // `notif:business:${id}`, ProviderDashboard.tsx `notif:provider:${id}`) — so
  // marking read here can invalidate exactly that badge's cache, rather than
  // waiting on the realtime channel to eventually resync it.
  const badgeCacheKey =
    scope?.scope === "BUSINESS" ? `notif:business:${scope.id}`
    : scope?.scope === "PROVIDER" ? `notif:provider:${scope.id}`
    // No ?scope= is the customer's own bell (Home, Profile, desktop sidebar), which is the badge to refresh —
    // leaving it undefined meant marking read here never updated it (NOTIF-4).
    : "notif:customer";
  const subtitle = scope?.scope === "BUSINESS" ? t("for_this_business")
    : scope?.scope === "PROVIDER" ? t("for_this_service")
    : scope?.scope === "CUSTOMER" ? t("personal_word") : undefined;

  const { data, loading, error, refetch } = useQueryWithRealtime(
    () => notificationService.list(scope),
    "notifications",
    [scopeKey],
    user.id ? `user_id=eq.${user.id}` : undefined,
  );
  const [items, setItems] = useState<AppNotification[]>([]);
  // Pages older than the newest 50, kept separately so a realtime refetch of the first page doesn't drop them.
  const [older, setOlder] = useState<AppNotification[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [noMoreOlder, setNoMoreOlder] = useState(false);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  // Booking being declined from its notification — held while the owner types
  // an optional reason, which the customer sees in their "Booking declined".
  const [declining, setDeclining] = useState<{ n: AppNotification; aptId: string } | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  // Ids marked read locally whose UPDATE may not have committed yet. A
  // realtime refetch triggered by ANY notifications change (an unrelated
  // insert is enough — a DB trigger fires on every one) used to land between
  // the optimistic flip and the commit, and `setItems(data)` would blind-
  // overwrite the row back to unread. Merging against this set keeps the tap
  // sticky; entries are dropped once the server agrees.
  const locallyReadRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setOlder([]);
    setNoMoreOlder(false);
  }, [scopeKey]);

  useEffect(() => {
    if (!data) return;
    setItems(
      data.map((n) => {
        if (n.isRead) {
          locallyReadRef.current.delete(n.id); // server caught up
          return n;
        }
        return locallyReadRef.current.has(n.id) ? { ...n, isRead: true } : n;
      }),
    );
  }, [data]);

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(refetch);

  // A realtime refetch rebuilds the first page; anything already loaded below it stays.
  const visible = useMemo(() => {
    const seen = new Set(items.map((n) => n.id));
    return [...items, ...older.filter((n) => !seen.has(n.id))];
  }, [items, older]);
  const sections = useMemo(() => groupByDay(visible, lang, t("today_word"), t("yesterday_word")), [visible, lang, t]);
  const canLoadOlder = !noMoreOlder && visible.length >= NOTIFICATION_PAGE_SIZE;

  async function loadOlder() {
    const oldest = visible[visible.length - 1];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await notificationService.list(scope, oldest.createdAt);
      if (page.length < NOTIFICATION_PAGE_SIZE) setNoMoreOlder(true);
      setOlder((p) => {
        const seen = new Set([...p, ...items].map((n) => n.id));
        return [...p, ...page.filter((n) => !seen.has(n.id))];
      });
    } catch {
      showToast(t("couldnt_load"));
    } finally {
      setLoadingOlder(false);
    }
  }
  const hasUnread = items.some((n) => !n.isRead);

  function open(n: AppNotification) {
    if (!n.isRead) {
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      locallyReadRef.current.add(n.id);
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      notificationService.markRead(n.id).catch(() => {
        // Persisting failed — undo the optimistic read rather than leave the
        // row looking read forever against a server that still says unread.
        locallyReadRef.current.delete(n.id);
        setItems((p) => p.map((x) => (x.id === n.id ? { ...x, isRead: false } : x)));
        refetch();
        showToast("Couldn't mark as read — try again");
      });
    }
    if (n.deepLink) nav(n.deepLink);
  }

  // Optimistic remove with a brief collapse animation, reverting + toasting
  // if the delete fails server-side (design-principles §6: optimistic +
  // revert + toast for every write).
  function remove(n: AppNotification) {
    const wasAt = items.findIndex((x) => x.id === n.id);
    setExitingIds((s) => new Set(s).add(n.id));
    setTimeout(() => {
      setItems((p) => p.filter((x) => x.id !== n.id));
      setOlder((p) => p.filter((x) => x.id !== n.id));
      setExitingIds((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
    }, 220);
    if (!n.isRead && badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    notificationService.remove(n.id).catch(() => {
      // Back where it was, not at the end — appending it broke the day grouping it belongs to (NOTIF-6).
      setItems((p) => {
        if (p.some((x) => x.id === n.id)) return p;
        const next = [...p];
        next.splice(wasAt >= 0 ? Math.min(wasAt, next.length) : next.length, 0, n);
        return next;
      });
      showToast("Couldn't delete — try again");
    });
  }

  async function handleAction(action: string, meta: any, n: AppNotification) {
    if (action === "ACCEPT" && meta?.appointmentId) {
      const aptId = meta.appointmentId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Confirmed",
                  tone: "success",
                  actions: [],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await appointmentService.updateStatus(aptId, "ACCEPTED");
        showToast(t("notif_apt_accepted_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't accept appointment");
        refetch();
      }
    } else if (action === "DECLINE" && meta?.appointmentId) {
      setDeclineNote("");
      setDeclining({ n, aptId: meta.appointmentId });
    } else if (action === "CALENDAR") {
      openCalendarEvent({
        title: `Booking: ${meta?.serviceName || meta?.actorName || "STRYT Appointment"}`,
        description: `Appointment with ${meta?.actorName || "shop"}. Time: ${meta?.timeLabel || ""}`,
        startTime: meta?.scheduledFor,
        uid: meta?.appointmentId,
      });
    } else if (action === "RESCHEDULE") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/appointments");
      }
    } else if (action === "ACCEPT_DELIVERY" && meta?.batchId) {
      const batchId = meta.batchId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Accepted",
                  tone: "success",
                  actions: ["TRACK_DELIVERY"],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await deliveryService.acceptBatch(batchId);
        showToast(t("notif_dlv_accepted_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't accept delivery run");
        refetch();
      }
    } else if (action === "DECLINE_DELIVERY" && meta?.batchId) {
      const batchId = meta.batchId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Declined",
                  tone: "danger",
                  actions: [],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await deliveryService.declineBatch(batchId);
        showToast(t("notif_dlv_declined_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't decline delivery run");
        refetch();
      }
    } else if (action === "TRACK_DELIVERY") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/appointments");
      }
    } else if (action === "CALL_RIDER") {
      if (meta?.agentPhone) {
        window.open(`tel:${meta.agentPhone}`, "_self");
      } else {
        showToast("Phone number not available");
      }
    } else if (action === "CALL_CUSTOMER") {
      if (meta?.customerPhone) {
        window.open(`tel:${meta.customerPhone}`, "_self");
      } else {
        showToast("Phone number not available");
      }
    } else if (action === "REASSIGN_DELIVERY") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else if (meta?.targetId) {
        nav(`/business/${meta.targetId}/manage/deliveries`);
      } else {
        nav("/appointments");
      }
    } else if (action === "COPY_OTP") {
      showToast(t("notif_dlv_otp_copied"));
    } else if (action === "VIEW_POST" || action === "REPLY_COMMENT") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/community");
      }
    } else if (action === "SHARE_ALERT") {
      const shareUrl = window.location.origin + (n.deepLink || "/community");
      const shareData = {
        title: n.title,
        text: `${n.title}: ${n.body}`,
        url: shareUrl,
      };
      if (typeof navigator.share === "function") {
        void navigator.share(shareData).catch(() => {});
      } else {
        navigator.clipboard.writeText(`${n.title}\n${n.body}\n${shareUrl}`);
        showToast(t("notif_comm_alert_shared"));
      }
    } else if (action === "VIEW_RECOMMENDED") {
      if (meta?.recommendedType === "BUSINESS" && meta?.recommendedId) {
        nav(`/business/${meta.recommendedId}`);
      } else if (meta?.recommendedType === "PROVIDER" && meta?.recommendedId) {
        nav(`/provider/${meta.recommendedId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/community");
      }
    } else if (action === "CONFIRM_DEPOSIT" && meta?.dealId && meta?.pledgerUserId) {
      const dealId = meta.dealId;
      const pledgerUserId = meta.pledgerUserId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Deposit Confirmed",
                  tone: "success",
                  actions: ["VIEW_DEAL"],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await bulkService.confirmDeposit(dealId, pledgerUserId);
        showToast(t("notif_bulk_deposit_confirmed_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't confirm deposit");
        refetch();
      }
    } else if (action === "REJECT_DEPOSIT" && meta?.dealId && meta?.pledgerUserId) {
      const dealId = meta.dealId;
      const pledgerUserId = meta.pledgerUserId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Deposit Rejected",
                  tone: "danger",
                  actions: [],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await bulkService.rejectDeposit(dealId, pledgerUserId);
        showToast(t("notif_bulk_deposit_rejected_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't reject deposit");
        refetch();
      }
    } else if (action === "VIEW_CLAIM_PASS") {
      nav("/community/activity");
    } else if (action === "VIEW_DEAL") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else if (meta?.targetId && meta?.dealId) {
        nav(`/business/${meta.targetId}/manage/bulk-deals/${meta.dealId}`);
      } else {
        nav("/community");
      }
    } else if (action === "SHARE_DEAL") {
      const shareUrl = window.location.origin + (n.deepLink || "/community");
      const shareData = {
        title: meta?.dealTitle || n.title,
        text: `${n.title}: ${n.body}`,
        url: shareUrl,
      };
      if (typeof navigator.share === "function") {
        void navigator.share(shareData).catch(() => {});
      } else {
        navigator.clipboard.writeText(`${n.title}\n${n.body}\n${shareUrl}`);
        showToast(t("notif_bulk_deal_shared_toast"));
      }
    } else if (action === "APPROVE_LOCATION" && meta?.requesterUserId) {
      const reqId = meta.requesterUserId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Approved (24h)",
                  tone: "success",
                  actions: [],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await locationService.respond(reqId, true);
        showToast(t("notif_loc_approved_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't approve location request");
        refetch();
      }
    } else if (action === "DECLINE_LOCATION" && meta?.requesterUserId) {
      const reqId = meta.requesterUserId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Declined",
                  tone: "neutral",
                  actions: [],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await locationService.respond(reqId, false);
        showToast(t("notif_loc_declined_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't decline location request");
        refetch();
      }
    } else if (action === "VIEW_ON_MAP") {
      if (meta?.lat != null && meta?.lng != null) {
        nav(`/map?lat=${meta.lat}&lng=${meta.lng}`);
      } else if (meta?.ownerUserId) {
        nav(`/u/${meta.ownerUserId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/map");
      }
    } else if (action === "TRACK_LIVE") {
      if (meta?.lat != null && meta?.lng != null) {
        nav(`/map?lat=${meta.lat}&lng=${meta.lng}&live=${meta.shareId || ""}`);
      } else if (meta?.conversationId) {
        nav(`/chat/${meta.conversationId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/map");
      }
    } else if (action === "OPEN_CHAT") {
      if (meta?.conversationId) {
        nav(`/chat/${meta.conversationId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/chats");
      }
    } else if (action === "CONFIRM_CUSTOM_PAYMENT" && meta?.paymentId) {
      const paymentId = meta.paymentId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Confirmed ✓",
                  tone: "success",
                  actions: ["VIEW_RECEIPT"],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await customPaymentService.confirm(paymentId);
        showToast(t("notif_pay_confirmed_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't confirm payment");
        refetch();
      }
    } else if (action === "REJECT_CUSTOM_PAYMENT" && meta?.paymentId) {
      const paymentId = meta.paymentId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Rejected",
                  tone: "danger",
                  actions: [],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await customPaymentService.reject(paymentId);
        showToast(t("notif_pay_rejected_toast"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't reject payment");
        refetch();
      }
    } else if (action === "VIEW_RECEIPT") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else if (meta?.targetType === "BUSINESS" && meta?.targetId) {
        nav(`/business/${meta.targetId}/manage/payments`);
      } else if (meta?.targetType === "PROVIDER" && meta?.targetId) {
        nav(`/provider/${meta.targetId}/manage/money`);
      } else {
        nav("/profile");
      }
    } else if (action === "VIEW_STORE") {
      if (meta?.targetType === "BUSINESS" && meta?.targetId) {
        nav(`/business/${meta.targetId}`);
      } else if (meta?.targetType === "PROVIDER" && meta?.targetId) {
        nav(`/provider/${meta.targetId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "RETRY_PAYMENT") {
      if (meta?.targetType === "BUSINESS" && meta?.targetId) {
        nav(`/business/${meta.targetId}`);
      } else if (meta?.targetType === "PROVIDER" && meta?.targetId) {
        nav(`/provider/${meta.targetId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "REPLY_RATING") {
      if (meta?.rateeType === "BUSINESS" && meta?.rateeId) {
        nav(`/business/${meta.rateeId}/manage/reviews`);
      } else if (meta?.rateeType === "PROVIDER" && meta?.rateeId) {
        nav(`/provider/${meta.rateeId}/manage/reviews`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "VIEW_REVIEW") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else if (meta?.targetType === "BUSINESS" && meta?.targetId) {
        nav(`/business/${meta.targetId}`);
      } else if (meta?.targetType === "PROVIDER" && meta?.targetId) {
        nav(`/provider/${meta.targetId}`);
      }
    } else if (action === "REVIEW_BUSINESS" || action === "VIEW_ADMIN") {
      nav("/admin");
    } else if (action === "VIEW_REPORT_TARGET") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/community");
      }
    } else if (action === "VIEW_BUSINESS") {
      const bizId = meta?.businessId || meta?.entityId;
      if (bizId) {
        nav(`/business/${bizId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "VIEW_PROVIDER") {
      const provId = meta?.providerId || meta?.entityId;
      if (provId) {
        nav(`/provider/${provId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "VIEW_PLACE") {
      const plId = meta?.placeId || meta?.entityId;
      if (plId) {
        nav(`/place/${plId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "CLAIM_OFFER") {
      const offerId = meta?.offerId;
      if (offerId) {
        setItems((p) =>
          p.map((x) =>
            x.id === n.id
              ? {
                  ...x,
                  isRead: true,
                  metadata: {
                    ...x.metadata,
                    statusPill: "Saved to Wallet",
                    tone: "success",
                    actions: ["VIEW_STORE"],
                  },
                }
              : x
          )
        );
        if (!n.isRead) void notificationService.markRead(n.id);
        if (meta?.offerCode) {
          navigator.clipboard?.writeText(meta.offerCode);
        }
        try {
          await walletService.saveCoupon(offerId);
          showToast(t("notif_disc_offer_saved_toast", "Coupon saved to your wallet! 🎉"));
          if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
        } catch (err: any) {
          showToast(err?.message || "Couldn't save coupon to wallet");
          refetch();
        }
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "BOOK_APPOINTMENT") {
      const provId = meta?.providerId || meta?.entityId;
      if (provId) {
        nav(`/provider/${provId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "CALL") {
      if (meta?.phone) {
        window.location.href = `tel:${meta.phone}`;
      }
    } else if (action === "DIRECTIONS") {
      if (meta?.lat != null && meta?.lng != null) {
        openExternal(`https://www.google.com/maps/dir/?api=1&destination=${meta.lat},${meta.lng}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/map");
      }
    } else if (action === "ACCEPT_QUOTE" && meta?.proposalId) {
      const propId = meta.proposalId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Accepted ✓",
                  tone: "success",
                  actions: ["VIEW_AGREEMENT"],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        const res = await requestService.acceptProposal(propId);
        showToast(t("notif_prop_accepted_toast", "Quote accepted! Agreement created 🎉"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
        if (res.agreementId) nav(`/agreement/${res.agreementId}`);
      } catch (err: any) {
        showToast(err?.message || "Couldn't accept quote");
        refetch();
      }
    } else if (action === "ACCEPT_COUNTER" && meta?.proposalId && meta?.counterId) {
      const propId = meta.proposalId;
      const counterId = meta.counterId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Counter Accepted ✓",
                  tone: "success",
                  actions: ["VIEW_AGREEMENT"],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        const res = await requestService.acceptProposalCounter(propId, counterId);
        showToast(t("notif_prop_counter_accepted_toast", "Counter-offer accepted! 🎉"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
        if (res.agreementId) nav(`/agreement/${res.agreementId}`);
      } catch (err: any) {
        showToast(err?.message || "Couldn't accept counter-offer");
        refetch();
      }
    } else if (action === "DECLINE_COUNTER") {
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Declined",
                  tone: "danger",
                  actions: [],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      showToast(t("notif_prop_counter_declined_toast", "Counter-offer declined"));
    } else if (action === "COUNTER_QUOTE") {
      if (meta?.requestId) {
        nav(`/request/${meta.requestId}?counter=${meta.proposalId || ""}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "VIEW_QUOTE") {
      if (meta?.requestId) {
        nav(`/request/${meta.requestId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "VIEW_AGREEMENT") {
      const agId = meta?.agreementId || meta?.entityId;
      if (agId) {
        nav(`/agreement/${agId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "CONFIRM_PAYMENT" && meta?.agreementId) {
      const agId = meta.agreementId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Payment Confirmed ✓",
                  tone: "success",
                  actions: ["VIEW_AGREEMENT"],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await requestService.confirmAgreementPayment(agId);
        showToast(t("notif_prop_payment_confirmed_toast", "Payment verified and confirmed ✓"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't confirm payment");
        refetch();
      }
    } else if (action === "REJECT_PAYMENT" && meta?.agreementId) {
      const agId = meta.agreementId;
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Payment Rejected",
                  tone: "danger",
                  actions: ["VIEW_AGREEMENT"],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      try {
        await requestService.rejectAgreementPaymentClaim(agId);
        showToast(t("notif_prop_payment_rejected_toast", "Payment verification rejected"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err: any) {
        showToast(err?.message || "Couldn't reject payment");
        refetch();
      }
    } else if (action === "PAY" && meta?.agreementId) {
      nav(`/agreement/${meta.agreementId}`);
    } else if (action === "JOIN_DEAL" && meta?.requestId) {
      try {
        await requestService.meToo(meta.requestId);
        showToast(t("notif_prop_joined_deal_toast", "Joined group deal!"));
      } catch {
        // Navigate to request detail
        nav(`/request/${meta.requestId}`);
      }
    } else if (action === "VIEW_REQUEST" || action === "SEND_QUOTE") {
      if (meta?.requestId) {
        nav(`/request/${meta.requestId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      }
    } else if (action === "SWITCH_BUSINESS") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else if (meta?.businessId) {
        nav(`/account/business-access?biz=${meta.businessId}`);
      } else {
        nav("/account/business-access");
      }
    } else if (action === "RESUBMIT_VERIFY") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else if (meta?.providerId || meta?.targetType === "PROVIDER") {
        nav(`/provider/${meta.providerId || meta.targetId}/manage/verify`);
      } else if (meta?.businessId || meta?.targetType === "BUSINESS") {
        nav(`/business/${meta.businessId || meta.targetId}/manage/verify`);
      } else {
        nav("/settings");
      }
    } else if (action === "REPLY_CHAT" || action === "OPEN_CHAT") {
      if (meta?.conversationId) {
        nav(`/chat/${meta.conversationId}`);
      } else if (n.deepLink) {
        nav(n.deepLink);
      } else {
        nav("/chat");
      }
    } else if (action === "ANSWER_QNA") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else if (meta?.businessId) {
        nav(`/business/${meta.businessId}/manage/community`);
      } else {
        nav("/community");
      }
    } else if (action === "VIEW_QNA") {
      if (n.deepLink) {
        nav(n.deepLink);
      } else if (meta?.businessId) {
        nav(`/business/${meta.businessId}`);
      } else {
        nav("/community");
      }
    } else if (action === "VIEW_DETAILS") {
      if (n.deepLink) {
        nav(n.deepLink);
      }
    }
  }

  async function confirmDecline() {
    if (!declining) return;
    const { n, aptId } = declining;
    const note = declineNote.trim();
    setDeclining(null);
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Declined",
                tone: "danger",
                actions: [],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      // No note → the customer gets the server's "Try another slot." wording.
      await appointmentService.updateStatus(aptId, "REJECTED", note || undefined);
      showToast(t("notif_apt_declined_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err: any) {
      showToast(err?.message || "Couldn't decline appointment");
      refetch();
    }
  }

  return (
    <div className="screen screen-boxed">
      <AppBar
        title={t("notifications")}
        subtitle={subtitle}
        right={
          hasUnread ? (
            <button
              className="tiny semi"
              // 44px minimum touch target — it used to be text-height only, next to the back button (NOTIF-7).
              style={{ color: "var(--brand-700)", minHeight: 44, padding: "0 10px", background: "none", border: "none" }}
              onClick={() => {
                const unreadIds = visible.filter((n) => !n.isRead).map((n) => n.id);
                unreadIds.forEach((id) => locallyReadRef.current.add(id));
                setItems((p) => p.map((n) => ({ ...n, isRead: true })));
                if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
                notificationService.markAllRead(scope).catch(() => {
                  unreadIds.forEach((id) => locallyReadRef.current.delete(id));
                  refetch();
                  showToast("Couldn't mark all as read — try again");
                });
              }}
            >
              {t("mark_all_read")}
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
          <EmptyState illustration={<NoNotificationsIllustration />} emoji="🔔" title={t("all_caught_up")} text={t("new_activity_desc")} />
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
                        type={n.type}
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
                        onAction={(action, meta) => handleAction(action, meta, n)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            {canLoadOlder && (
              <div className="row center" style={{ padding: "14px 0 20px" }}>
                <button className="btn btn-outline btn-sm" disabled={loadingOlder} onClick={() => void loadOlder()}>
                  {loadingOlder ? t("loading") : t("load_older_notifications")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {declining && (
        <div className="overlay" onClick={() => setDeclining(null)}>
          <div className="sheet col gap-14" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="bold" style={{ fontSize: 16 }}>{t("notif_apt_decline_title")}</div>
            <div className="tiny muted">{t("notif_apt_decline_hint")}</div>
            <textarea
              className="input"
              rows={3}
              placeholder={t("notif_apt_decline_placeholder")}
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              style={{ fontSize: 13, padding: 10 }}
            />
            <div className="row gap-8 end">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeclining(null)}>{t("back_word")}</button>
              <button className="btn btn-primary btn-sm" onClick={confirmDecline}>{t("notif_apt_decline")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
