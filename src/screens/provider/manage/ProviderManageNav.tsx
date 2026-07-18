import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarClock, Search, Wallet, User } from "@/components/Icons";
import { appointmentService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";

export default function ProviderManageNav({ pid }: { pid: string }) {
  const nav = useNavigate();
  const loc = useLocation();
  const base = `/provider/${pid}/manage`;

  // Surface how many booking requests still need a response as a badge on Jobs,
  // so the provider always knows there's something waiting without opening it.
  const { data: appts } = useQueryWithRealtime(
    () => appointmentService.listForTarget(pid),
    "appointments",
    [pid],
    `target_id=eq.${pid}`
  );
  const pendingLeads = (appts ?? []).filter((a) => a.status === "PENDING").length;

  // The 5 modes a provider is actually in — Today (triage), Jobs (the calendar),
  // Find work (prospecting), Money (earnings), Profile (identity hub). See
  // PROVIDER_DESIGN.md.
  const items = [
    { to: base, label: "Today", icon: LayoutDashboard, exact: true, badge: 0 },
    { to: `${base}/jobs`, label: "Jobs", icon: CalendarClock, badge: pendingLeads },
    { to: `${base}/find-work`, label: "Find work", icon: Search, badge: 0 },
    { to: `${base}/money`, label: "Money", icon: Wallet, badge: 0 },
    { to: `${base}/profile`, label: "Profile", icon: User, badge: 0 },
  ];

  return (
    <nav className="bottom-nav provider-nav">
      {items.map((it) => {
        const Icon = it.icon;
        const active = it.exact ? loc.pathname === it.to : loc.pathname.startsWith(it.to);
        return (
          <button key={it.to} className={`nav-item ${active ? "active" : ""}`} onClick={() => nav(it.to)} aria-label={it.label}>
            <span className="provider-nav-icon">
              <Icon size={21} strokeWidth={active ? 2.6 : 2} />
              {it.badge > 0 && <span className="provider-nav-badge">{it.badge > 9 ? "9+" : it.badge}</span>}
            </span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
