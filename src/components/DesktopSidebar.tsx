import { useNavigate, useLocation } from "react-router-dom";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { displayName } from "@/lib/publicName";
import { PLACEHOLDER_AVATAR } from "@/lib/placeholders";
import { SafeImg } from "@/components/common";
import {
  Home, Map, Plus, Settings, Bell, LogOut,
  LayoutDashboard, LayoutGrid, Inbox, CalendarClock, ImageIcon,
  UserCircle
} from "@/components/Icons";
import RoleSwitcher from "@/components/RoleSwitcher";
import BrandLockup from "@/components/BrandLockup";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";

export default function DesktopSidebar() {
  const nav = useNavigate();
  const loc = useLocation();
  const { t } = useI18n();
  const {
    user,
    activeContext,
    chatUnread,
    signOut,
    ownedBusinessIds,
    ownedProviderId
  } = useApp();
  const ambient = useAmbientTheme();

  const isBusiness = activeContext.type === "business";
  const isProvider = activeContext.type === "provider";
  const hasMultipleRoles = ownedBusinessIds.length > 0 || !!ownedProviderId;

  // The sidebar's own "home" is whatever context the user is currently in —
  // the business/provider dashboard while in that hat, customer Home otherwise.
  // Used to previously hardcode nav("/home") here regardless of context, which
  // bounced business/provider owners out to the customer app when they clicked
  // the brand mark (and left a stray customer-Home entry in browser history for
  // the back button to land on). Mirrors BrandHome's goHome() — same rule, one
  // place each type of header gets it from.
  function goHome() {
    if (isBusiness && activeContext.id) nav(`/business/${activeContext.id}/manage`);
    else if (isProvider && activeContext.id) nav(`/provider/${activeContext.id}/manage`);
    else nav("/home");
  }

  // Custom action sheet toggle or navigate to ask
  const handleCreateAction = () => {
    nav("/ask");
  };

  // Log out function
  const handleLogOut = () => {
    signOut();
    nav("/");
  };

  // Build items based on active role
  const getNavItems = () => {
    if (isBusiness && activeContext.id) {
      const base = `/business/${activeContext.id}/manage`;
      return [
        { to: base, label: "Home", icon: LayoutDashboard, exact: true },
        { to: `${base}/catalog`, label: "Catalog", icon: LayoutGrid },
        { to: `${base}/inbox`, label: "Inbox", icon: Inbox, badge: chatUnread || undefined },
        { to: `${base}/appointments`, label: "Appointments", icon: CalendarClock },
        { to: `${base}/queue`, label: "Live Queue", icon: Plus },
        { to: `${base}/offers`, label: "Offers", icon: ImageIcon },
        { to: `${base}/settings`, label: "Settings", icon: Settings },
      ];
    }

    if (isProvider && activeContext.id) {
      const base = `/provider/${activeContext.id}/manage`;
      return [
        { to: base, label: "Home", icon: LayoutDashboard, exact: true },
        { to: `${base}/leads`, label: "Leads", icon: Inbox, badge: chatUnread || undefined },
        { to: `${base}/availability`, label: "Availability", icon: CalendarClock },
        { to: `${base}/catalog`, label: "Catalog", icon: LayoutGrid },
        { to: `${base}/portfolio`, label: "Work", icon: ImageIcon },
        { to: `${base}/settings`, label: "Settings", icon: Settings },
      ];
    }

    // Default Customer context
    return [
      { to: "/home", label: t("home") || "Home", icon: Home, exact: true },
      { to: "/explore", label: "Explore", icon: UserCircle },
      { to: "/map", label: t("map") || "Map", icon: Map },
      { to: "/community-hub", label: "Community", icon: ImageIcon },
      { to: "/notifications", label: "Notifications", icon: Bell, badge: chatUnread || undefined },
      { to: "/queues", label: "My Queues", icon: Plus },
      { to: "/settings", label: "Settings", icon: Settings },
    ];
  };

  const navItems = getNavItems();

  return (
    <aside className="desktop-sidebar">
      {/* Brand Header — context-aware: business/provider tap goes to that
          console's own dashboard, not the customer app (see goHome() above). */}
      <div className="sidebar-brand" style={{ color: "var(--brand-600)" }}>
        <BrandLockup glow={ambient.lampGlow} size={19} onClick={goHome} />
      </div>

      {/* User Profile Card & Switcher */}
      <div className="sidebar-profile-box">
        <div className="row gap-10">
          <SafeImg
            src={user.avatar || PLACEHOLDER_AVATAR}
            alt={user.name}
            className="sidebar-avatar"
            style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid var(--brand-100)" }}
          />
          <div className="col grow" style={{ minWidth: 0 }}>
            <span className="bold text-ellipsis" style={{ fontSize: 14.5, color: "var(--ink-900)" }}>
              {displayName(user.name)}
            </span>
            <span className="tiny muted text-ellipsis" style={{ fontSize: 11.5 }}>
              {isBusiness ? "Business Mode" : isProvider ? "Provider Mode" : user.area || "Customer"}
            </span>
          </div>
        </div>

        {/* Real dropdown — lists every hat (Personal + each owned business/provider),
            not just a binary back-and-forth toggle. */}
        {hasMultipleRoles && (
          <div style={{ marginTop: 12 }}>
            <RoleSwitcher />
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact ? loc.pathname === item.to : loc.pathname.startsWith(item.to);
          return (
            <button
              key={item.to}
              className={`sidebar-nav-item ${isActive ? "active" : ""}`}
              onClick={() => nav(item.to)}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="grow text-left">{item.label}</span>
              {item.badge ? <span className="count-badge sidebar-badge">{item.badge}</span> : null}
            </button>
          );
        })}
      </nav>

      {/* Action Buttons */}
      <div className="sidebar-actions">
        {/* Create FAB shortcut on desktop (only in customer view) */}
        {!isBusiness && !isProvider && (
          <button className="sidebar-create-btn" onClick={handleCreateAction}>
            <Plus size={18} strokeWidth={2.8} />
            <span>Post a Request</span>
          </button>
        )}

        {/* Download Android APK Button */}
        <a href={APK_DOWNLOAD_URL} download={APK_FILENAME} className="sidebar-download-btn">

          <span>🤖</span>
          <span>Download Android App</span>
        </a>
      </div>

      {/* Log out Footer */}
      <div className="sidebar-footer">
        <button className="sidebar-logout-btn" onClick={handleLogOut}>
          <LogOut size={18} />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
