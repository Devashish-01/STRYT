import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Briefcase, CalendarClock, Clock, Home, LayoutDashboard, MessageSquareText, Package, Sparkles, Star, Store, Users, Wallet, X,
} from "@/components/Icons";
import { businessService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useBusinessAccess } from "@/lib/businessAccess";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import FooterProfileTab from "@/components/FooterProfileTab";
import QuickDial, { type DialCircle } from "@/components/console/QuickDial";
import { CAPABILITY_TONE } from "@/components/console/capabilities";
import { BUSINESS_PACKAGES, resolvePackage, type ConsoleCapability } from "@/lib/businessPackages";
import { consoleFor } from "@/lib/consoleSteps";
import { buildDialItems, type DialId } from "@/lib/businessDial";
import { haptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";

/** Held this long, or dragged this far up, the Home button opens the dial instead of going home. */
const HOLD_MS = 380;
const SWIPE_UP_PX = 26;
const HINT_KEY = "stryt_console_dial_hint_v1";

const ICON: Record<DialId, ReactNode> = {
  appointments: <CalendarClock size={22} />,
  queue: <Users size={22} />,
  deliveries: <Package size={22} />,
  "my-deliveries": <Package size={22} />,
  store: <Store size={22} />,
  business: <Briefcase size={22} />,
  messages: <MessageSquareText size={22} />,
  payments: <Wallet size={22} />,
  hours: <Clock size={22} />,
  reviews: <Star size={22} />,
  features: <Sparkles size={22} />,
};

/** Reuses the console's capability colours so a circle looks like the tile for the same thing on the Home page. */
const TONE: Record<DialId, ConsoleCapability> = {
  appointments: "bookings",
  queue: "queue",
  deliveries: "delivery",
  "my-deliveries": "delivery",
  store: "catalog",
  business: "hours",
  messages: "inbox",
  payments: "payments",
  hours: "hours",
  reviews: "inbox",
  features: "promote",
};

function readHintSeen(): boolean {
  try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return true; }
}
function markHintSeen() {
  try { localStorage.setItem(HINT_KEY, "1"); } catch { /* the hint just shows again next time */ }
}

/**
 * The business console's bottom bar: Dashboard · Home · Profile.
 *
 * Home is a raised round button. Tapping it goes home (or, already home, opens the dial); holding it or swiping up opens the
 * quick dial — a rotary fan of round shortcuts to everything else the console does (see QuickDial). Which circles appear, in
 * what order and under what names comes from who is looking and what kind of business it is (src/lib/businessDial.ts).
 */
export default function ManageNav({ bizId, waitingCount }: { bizId: string; waitingCount?: number }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const { hasScope, hasActiveDeliveries, isOwner } = useBusinessAccess();
  const { data: queue } = useQueryWithRealtime(
    () => businessService.queueOwnerState(bizId),
    "queue_tokens",
    [bizId],
    `business_id=eq.${bizId}`,
    `queue:${bizId}`,
  );
  // Shares ManageDashboard's `business:${id}` cache entry, so this costs no extra fetch.
  const { data: business } = useQuery(() => businessService.get(bizId), [bizId], `business:${bizId}`);
  const pkg = BUSINESS_PACKAGES[resolvePackage(business ?? {})];
  const consoleCfg = consoleFor(pkg);
  // Does this business take bookings at all — same formula BusinessDetail.tsx and BusinessSettings.tsx use for the
  // customer-facing CTA. A pharmacy or takeaway that structurally never uses it isn't shown a permanently-empty circle.
  const bookingsOn = business?.bookingsEnabled ?? pkg.bookingsDefault;
  // Coerced to a real boolean: while the queue query is in flight `queue` is undefined, and `undefined && {...}` would
  // slip through as `undefined` rather than `false`.
  const queueUsed = !!queue?.hasEverUsedQueue;
  const queueWaiting = waitingCount ?? queue?.waiting.length ?? 0;
  const base = `/business/${bizId}/manage`;

  const items = useMemo(() => buildDialItems({
    businessId: bizId,
    base,
    isOwner,
    hasScope,
    bookingsOn,
    queueUsed: queueUsed || queueWaiting > 0,
    queueWaiting,
    deliveryOn: DELIVERY_AGENT_ENABLED && (business?.deliveryEnabled === true || hasActiveDeliveries),
    hasActiveDeliveries: DELIVERY_AGENT_ENABLED && hasActiveDeliveries,
    storeLabel: consoleCfg.storeTabLabel,
    consoleOrder: consoleCfg.actions.map((a) => a.id),
    consoleLabels: Object.fromEntries(consoleCfg.actions.map((a) => [a.id, a.label])),
  }), [bizId, base, isOwner, hasScope, bookingsOn, queueUsed, queueWaiting, business?.deliveryEnabled, hasActiveDeliveries, consoleCfg]);

  const circles: DialCircle[] = useMemo(() => items.map((item) => ({
    id: item.id,
    label: item.label ?? t(item.labelKey ?? item.id),
    icon: ICON[item.id],
    tint: CAPABILITY_TONE[TONE[item.id]].tint,
    accent: CAPABILITY_TONE[TONE[item.id]].accent,
    badge: item.badge,
  })), [items, t]);

  const onHome = location.pathname === base;
  const dashboardPath = `${base}/dashboard`;
  const dashboardActive = location.pathname.startsWith(dashboardPath);
  const profileRoutes = ["/profile", "/edit-profile", "/verify", "/settings", "/payments", "/broadcast"];
  const profileActive = profileRoutes.some((path) => location.pathname.startsWith(base + path));

  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);

  // Close whenever the screen changes underneath it, so the dim layer can never outlive the page it was opened on.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // A one-time nudge on Home, where people first look for tools. Gone for good once the dial has been opened.
  useEffect(() => {
    if (!onHome || readHintSeen()) return;
    setHint(true);
    const timer = setTimeout(() => setHint(false), 7000);
    return () => clearTimeout(timer);
  }, [onHome]);

  const openDial = useCallback(() => {
    haptics.medium();
    markHintSeen();
    setHint(false);
    setOpen(true);
  }, []);
  const closeDial = useCallback(() => setOpen(false), []);

  // Gesture state for the Home button. A hold or a swipe-up opens the dial; the click that follows must not also "tap".
  const press = useRef<{ y: number; timer: number; consumed: boolean } | null>(null);
  const clearPress = () => { if (press.current) window.clearTimeout(press.current.timer); };
  const onPointerDown = (e: React.PointerEvent) => {
    clearPress();
    if (open) { press.current = null; return; }
    const state = { y: e.clientY, timer: 0, consumed: false };
    state.timer = window.setTimeout(() => { state.consumed = true; openDial(); }, HOLD_MS);
    press.current = state;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || p.consumed) return;
    if (p.y - e.clientY > SWIPE_UP_PX) { p.consumed = true; clearPress(); openDial(); }
  };
  const onPointerEnd = () => {
    clearPress();
    // A hold or swipe has already opened the dial. Normally the click that follows is swallowed by `consumed`; if the
    // browser sends none (a drag usually doesn't), drop the flag shortly after so it can't swallow the NEXT tap.
    const p = press.current;
    if (p?.consumed) window.setTimeout(() => { if (press.current === p) press.current = null; }, 80);
  };
  const onClick = () => {
    // Left-over gesture flag is read once, then cleared, so the next real tap behaves normally.
    if (press.current?.consumed) { press.current = null; return; }
    press.current = null;
    if (open) { closeDial(); return; }
    if (!onHome) { haptics.selection(); nav(base); return; }
    openDial();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); openDial(); }
  };

  const select = (id: string) => {
    const item = items.find((i) => i.id === id);
    setOpen(false);
    if (item) nav(item.to);
  };

  return (
    <>
      <nav className="bottom-nav manage-nav manage-nav--dial" aria-label="Business console">
        <button className={`nav-item ${dashboardActive ? "active" : ""}`} onClick={() => nav(dashboardPath)}>
          <LayoutDashboard size={22} weight={dashboardActive ? "fill" : "regular"} />
          <span>{t("nav_dashboard")}</span>
        </button>

        <div className={`manage-home${onHome ? " is-active" : ""}${open ? " is-open" : ""}`}>
          {hint && !open && <span className="manage-home-hint" role="status">{t("bdial_hint")}</span>}
          <button
            type="button"
            className="manage-home-hit"
            aria-label={open ? t("bdial_close") : t("bdial_home_aria")}
            aria-expanded={open}
            onClick={onClick}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerLeave={onPointerEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="manage-home-circle">
              <span className="manage-home-icon is-home"><Home size={28} weight="fill" /></span>
              <span className="manage-home-icon is-close"><X size={26} weight="bold" /></span>
              {queueWaiting > 0 && !open && <span className="count-badge">{queueWaiting > 9 ? "9+" : queueWaiting}</span>}
            </span>
            <span className="manage-home-label">{t("home")}</span>
          </button>
        </div>

        <FooterProfileTab profilePath={`${base}/profile`} active={profileActive} />
      </nav>
      <QuickDial items={circles} open={open} onClose={closeDial} onSelect={select} label={t("bdial_aria")} turnHint={t("bdial_turn")} />
    </>
  );
}
