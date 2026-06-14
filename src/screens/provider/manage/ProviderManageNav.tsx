import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Inbox, CalendarClock, ImageIcon, Settings } from "lucide-react";

export default function ProviderManageNav({ pid }: { pid: string }) {
  const nav = useNavigate();
  const loc = useLocation();
  const base = `/provider/${pid}/manage`;
  const items = [
    { to: base, label: "Home", icon: LayoutDashboard, exact: true },
    { to: `${base}/leads`, label: "Leads", icon: Inbox },
    { to: `${base}/availability`, label: "Availability", icon: CalendarClock },
    { to: `${base}/portfolio`, label: "Work", icon: ImageIcon },
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
