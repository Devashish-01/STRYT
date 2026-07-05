import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { displayName } from "@/lib/publicName";
import { PLACEHOLDER_AVATAR } from "@/lib/placeholders";
import { SafeImg } from "@/components/common";
import {
  Home, Map, Plus, User, Settings, Bell, LogOut,
  LayoutDashboard, LayoutGrid, Inbox, CalendarClock, ImageIcon,
  Store, Briefcase, UserCircle, ChevronRight
} from "@/components/Icons";

export default function DesktopSidebar() {
  const nav = useNavigate();
  const loc = useLocation();
  const { t } = useI18n();
  const {
    user,
    activeContext,
    chatUnread,
    signOut,
    setActiveRole,
    roles,
    ownedBusinessIds,
    ownedProviderId
  } = useApp();

  const isBusiness = activeContext.type === "business";
  const isProvider = activeContext.type === "provider";
  const hasMultipleRoles = ownedBusinessIds.length > 0 || !!ownedProviderId;

  // Custom action sheet toggle or navigate to ask
  const handleCreateAction = () => {
    nav("/ask");
  };

  // Log out function
  const handleLogOut = () => {
    signOut();
    nav("/");
  };

  // Switch context helper
  const handleRoleSwitch = () => {
    if (isBusiness || isProvider) {
      // Go back to customer
      setActiveRole("customer");
      nav("/home");
    } else {
      // Switch to first owned business or provider
      if (ownedBusinessIds.length > 0) {
        setActiveRole("business_owner");
        nav(`/business/${ownedBusinessIds[0]}/manage`);
      } else if (ownedProviderId) {
        setActiveRole("provider");
        nav(`/provider/${ownedProviderId}/manage`);
      }
    }
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
      {/* Brand Header */}
      <div className="sidebar-brand" onClick={() => nav("/home")}>
        <svg width="34" height="34" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
          <path d="M32 11 C21.5 11 13 19.5 13 30 C13 43 32 56 32 56 C32 56 51 43 51 30 C51 19.5 42.5 11 32 11 Z" fill="var(--brand-600)" />
          <path d="M32 41 C24 35 40 24 32 17" stroke="#fff" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="logo-text">STRYT</span>
      </div>

      {/* User Profile Card & Switcher */}
      <div className="sidebar-profile-box">
        <div className="row gap-10">
          <SafeImg
            src={user.avatar || PLACEHOLDER_AVATAR}
            alt={user.name}
            className="sidebar-avatar"
            style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid var(--brand-100)" }}
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

        {/* Role Switcher Action */}
        {hasMultipleRoles && (
          <button className="role-switch-btn row between gap-4" onClick={handleRoleSwitch}>
            <span className="row gap-6">
              {isBusiness ? <Store size={14} /> : isProvider ? <Briefcase size={14} /> : <UserCircle size={14} />}
              <span>{isBusiness || isProvider ? "Switch to Personal" : "Switch to Console"}</span>
            </span>
            <ChevronRight size={14} />
          </button>
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
              {item.badge ? <span className="sidebar-badge">{item.badge}</span> : null}
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
        <a href="/stryt.apk" download className="sidebar-download-btn">
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
