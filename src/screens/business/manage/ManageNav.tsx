import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, LayoutGrid, Inbox, CalendarClock, Settings } from "@/components/Icons";

export default function ManageNav({ bizId }: { bizId: string }) {
  const nav = useNavigate();
  const loc = useLocation();
  const base = `/business/${bizId}/manage`;
  const items = [
    { to: base, label: "Home", icon: LayoutDashboard, exact: true },
    { to: `${base}/catalog`, label: "Catalog", icon: LayoutGrid },
    { to: `${base}/inbox`, label: "Inbox", icon: Inbox },
    // Promote temporarily hidden — re-enable later (route + Promote.tsx kept).
    { to: `${base}/appointments`, label: "Appointments", icon: CalendarClock },
    { to: `${base}/settings`, label: "Settings", icon: Settings },
  ];

  return (
    <nav className="bottom-nav">
      {items.map((it) => {
        const Icon = it.icon;
        const active = it.exact ? loc.pathname === it.to : loc.pathname.startsWith(it.to);
        return (
          <button key={it.to} className={`nav-item ${active ? "active" : ""}`} onClick={() => nav(it.to)}>
            <Icon size={22} strokeWidth={active ? 2.6 : 2} />
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
