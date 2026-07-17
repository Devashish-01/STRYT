import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, CalendarClock, Home, Store, Users } from "@/components/Icons";
import { businessService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";

export default function ManageNav({ bizId, waitingCount }: { bizId: string; waitingCount?: number }) {
  const nav = useNavigate();
  const location = useLocation();
  const { data: queue } = useQueryWithRealtime(
    () => businessService.queueOwnerState(bizId),
    "queue_tokens",
    [bizId],
    `business_id=eq.${bizId}`,
  );
  const queueCount = waitingCount ?? queue?.waiting.length ?? 0;
  const base = `/business/${bizId}/manage`;
  const storeRoutes = ["/store", "/catalog", "/portfolio", "/hours"];
  const businessRoutes = [
    "/business", "/inbox", "/qna", "/reviews", "/requests", "/community",
    "/profile", "/verify", "/settings",
  ];
  const items = [
    { to: base, label: "Today", icon: Home, active: location.pathname === base },
    { to: `${base}/queue`, label: "Queue", icon: Users, active: location.pathname.startsWith(`${base}/queue`), badge: queueCount },
    { to: `${base}/appointments`, label: "Bookings", icon: CalendarClock, active: location.pathname.startsWith(`${base}/appointments`) },
    { to: `${base}/store`, label: "Store", icon: Store, active: storeRoutes.some((path) => location.pathname.startsWith(base + path)) },
    { to: `${base}/business`, label: "Business", icon: Briefcase, active: businessRoutes.some((path) => location.pathname.startsWith(base + path)) },
  ];

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
