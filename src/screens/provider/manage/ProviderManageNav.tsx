import { useNavigate, useLocation } from "react-router-dom";
import { Home, CalendarClock, Search, Wallet } from "@/components/Icons";
import { useProviderAppointments } from "@/features/provider-console/providerAppointments";
import { activeProviderTab } from "@/features/provider-console/providerNavigation";
import FooterProfileTab from "@/components/FooterProfileTab";
import { useI18n } from "@/lib/i18n";

export default function ProviderManageNav({ pid }: { pid: string }) {
  const { t, tf } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const base = `/provider/${pid}/manage`;
  const profilePath = `${base}/profile`;
  const activeTab = activeProviderTab(base, loc.pathname);
  const profileActive = activeTab === "profile";
  const { data: appts } = useProviderAppointments();
  const pendingBookings = (appts ?? []).filter((a) => a.status === "PENDING").length;

  const items = [
    { id: "home", to: base, label: t("home"), icon: Home, badge: 0 },
    { id: "jobs", to: `${base}/jobs`, label: t("nav_jobs"), icon: CalendarClock, badge: pendingBookings },
    { id: "find-work", to: `${base}/find-work`, label: t("nav_find_work"), icon: Search, badge: 0 },
    { id: "money", to: `${base}/money`, label: t("nav_money"), icon: Wallet, badge: 0 },
  ];

  return (
    <nav className="bottom-nav provider-nav" aria-label={t("provider_console_nav")}>
      {items.map((it) => {
        const Icon = it.icon;
        const active = activeTab === it.id;
        return (
          <button key={it.to} className={`nav-item ${active ? "active" : ""}`} onClick={() => nav(it.to)}
            aria-current={active ? "page" : undefined}
            aria-label={it.badge > 0 ? tf("provider_jobs_pending", { n: it.badge }) : it.label}>
            <span className="provider-nav-icon">
              <Icon size={21} strokeWidth={active ? 2.6 : 2} />
              {it.badge > 0 && <span className="provider-nav-badge" aria-hidden="true">{it.badge > 9 ? "9+" : it.badge}</span>}
            </span>
            <span>{it.label}</span>
          </button>
        );
      })}
      <FooterProfileTab profilePath={profilePath} active={profileActive} iconStrokeWidth={profileActive ? 2.6 : 2} />
    </nav>
  );
}
