import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, CalendarClock, Home, Store, Users } from "@/components/Icons";
import { businessService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";

export default function ManageNav({ bizId, waitingCount }: { bizId: string; waitingCount?: number }) {
  const nav = useNavigate();
  const location = useLocation();
  const { hasScope } = useBusinessAccess();
  const { data: queue } = useQueryWithRealtime(
    () => businessService.queueOwnerState(bizId),
    "queue_tokens",
    [bizId],
    `business_id=eq.${bizId}`,
    `queue:${bizId}`,
  );
  const queueCount = waitingCount ?? queue?.waiting.length ?? 0;
  const base = `/business/${bizId}/manage`;
  const storeRoutes = ["/store", "/catalog", "/portfolio", "/hours"];
  const businessRoutes = [
    "/business", "/inbox", "/qna", "/reviews", "/requests", "/community",
    "/profile", "/verify", "/settings", "/payments",
  ];
  // A scoped team member only sees the tabs matching their granted scopes —
  // Home and Business always show (Business's own menu narrows further, in
  // BusinessHub, since it fans into sections of mixed sensitivity).
  const items = [
    { to: base, label: "Home", icon: Home, active: location.pathname === base },
    hasScope("queue") && { to: `${base}/queue`, label: "Queue", icon: Users, active: location.pathname.startsWith(`${base}/queue`), badge: queueCount },
    hasScope("appointments") && { to: `${base}/appointments`, label: "Bookings", icon: CalendarClock, active: location.pathname.startsWith(`${base}/appointments`) },
    hasScope("catalog") && { to: `${base}/store`, label: "Store", icon: Store, active: storeRoutes.some((path) => location.pathname.startsWith(base + path)) },
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
    </nav>
  );
}
