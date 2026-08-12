import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, CalendarClock, Home, Package, Store, Users } from "@/components/Icons";
import { businessService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import FooterProfileTab from "@/components/FooterProfileTab";
import { BUSINESS_PACKAGES, resolvePackage } from "@/lib/businessPackages";
import { consoleFor } from "@/lib/consoleSteps";

export default function ManageNav({ bizId, waitingCount }: { bizId: string; waitingCount?: number }) {
  const nav = useNavigate();
  const location = useLocation();
  const { hasScope, hasActiveDeliveries } = useBusinessAccess();
  const { data: queue } = useQueryWithRealtime(
    () => businessService.queueOwnerState(bizId),
    "queue_tokens",
    [bizId],
    `business_id=eq.${bizId}`,
    `queue:${bizId}`,
  );
  // Shares ManageDashboard's `business:${id}` cache entry, so this costs no
  // extra fetch — it's only here to name the storefront tab in the owner's own
  // vocabulary ("Menu" for a kitchen, "Store" otherwise).
  const { data: business } = useQuery(() => businessService.get(bizId), [bizId], `business:${bizId}`);
  const storeTabLabel = consoleFor(BUSINESS_PACKAGES[resolvePackage(business ?? {})]).storeTabLabel;
  // Does this business take bookings at all — same formula BusinessDetail.tsx
  // and BusinessSettings.tsx already use for the customer-facing CTA. Hides
  // the Appointments tab for packages like pharmacy/takeaway that structurally
  // never use it, rather than showing every owner a permanently-empty tab.
  const bookingsOn = business?.bookingsEnabled ?? BUSINESS_PACKAGES[resolvePackage(business ?? {})].bookingsDefault;
  // Coerced to a real boolean: while the queue query is still in flight,
  // `queue` is undefined, and `undefined && {...}` evaluates to `undefined`
  // rather than `false` — which would slip past the `!== false` filter below
  // and crash `.map` on an undefined item for one render.
  const hasEverUsedQueue = !!queue?.hasEverUsedQueue;
  const queueCount = waitingCount ?? queue?.waiting.length ?? 0;
  const base = `/business/${bizId}/manage`;
  const storeRoutes = ["/store", "/catalog", "/portfolio", "/hours"];
  const businessRoutes = [
    "/business", "/inbox", "/qna", "/reviews", "/requests", "/community",
  ];
  const profileRoutes = [
    "/profile", "/edit-profile", "/verify", "/settings", "/payments", "/broadcast",
  ];
  const profilePath = `${base}/profile`;
  const profileActive = profileRoutes.some((path) => location.pathname.startsWith(base + path));

  const items = [
    { to: base, label: "Home", icon: Home, active: location.pathname === base },
    // Real per-business usage, not a per-package guess — see businessService's
    // hasEverUsedQueue. A business that's never touched queue settings has no
    // tab; BusinessHub's Operations section offers the same destination as a
    // one-time "Set up walk-in queue" entry instead, so the feature is still
    // discoverable.
    hasScope("queue") && hasEverUsedQueue && { to: `${base}/queue`, label: "Queue", icon: Users, active: location.pathname.startsWith(`${base}/queue`), badge: queueCount },
    hasScope("appointments") && bookingsOn && { to: `${base}/appointments`, label: "Appointments", icon: CalendarClock, active: location.pathname.startsWith(`${base}/appointments`) },
    DELIVERY_AGENT_ENABLED && hasActiveDeliveries && {
      to: `${base}/my-deliveries`,
      label: "Deliveries",
      icon: Package,
      active: location.pathname.startsWith(`${base}/my-deliveries`),
    },
    hasScope("catalog") && { to: `${base}/store`, label: storeTabLabel, icon: Store, active: storeRoutes.some((path) => location.pathname.startsWith(base + path)) },
    { to: `${base}/business`, label: "Business", icon: Briefcase, active: businessRoutes.some((path) => location.pathname.startsWith(base + path)) },
  ].filter((item): item is Exclude<typeof item, false> => item !== false);

  return (
    <nav className="bottom-nav" aria-label="Business console">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.to} className={`nav-item ${item.active ? "active" : ""}`} onClick={() => nav(item.to)}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon size={22} strokeWidth={item.active ? 2.6 : 2} />
              {!!item.badge && <span className="count-badge" style={{ position: "absolute", top: -8, right: -12, minWidth: 16, height: 16, fontSize: 9 }}>{item.badge > 9 ? "9+" : item.badge}</span>}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
      <FooterProfileTab profilePath={profilePath} active={profileActive} />
    </nav>
  );
}
