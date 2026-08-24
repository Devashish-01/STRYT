import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Camera, ChevronRight, Home, Map, Megaphone, MessageSquare, Package, Plus, User, Users, X } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { prefetchMapView } from "@/lib/prefetchRoutes";
import { ActionIconBadge } from "@/components/ActionIconBadge";
import FooterProfileTab from "./FooterProfileTab";

export default function BottomNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const [sheet, setSheet] = useState(false);
  const { t } = useI18n();
  const { isGuest } = useApp();
  const requireAuth = useRequireAuth();

  const profileActive = loc.pathname === "/profile";

  const guestSignInTab = (
    <button
      className="nav-item"
      onClick={() => nav("/auth/phone")}
      aria-label={t("sign_in")}
    >
      <User size={22} weight="regular" />
      <span>{t("sign_in")}</span>
    </button>
  );

  return (
    <>
      <nav className="bottom-nav">
        <NavLink to="/home" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {({ isActive }) => (
            <>
              <Home size={22} weight={isActive ? "fill" : "regular"} className="nav-item__icon" />
              <span>{t("home")}</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/map"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          onPointerDown={prefetchMapView}
        >
          {({ isActive }) => (
            <>
              <Map size={22} weight={isActive ? "fill" : "regular"} className="nav-item__icon" />
              <span>{t("map")}</span>
            </>
          )}
        </NavLink>

        <button
          className="nav-item nav-fab"
          onClick={requireAuth(() => setSheet(true), "Sign in to post on your street")}
          aria-label="Create"
        >
          <span className="fab-circle"><Plus size={26} weight="bold" /></span>
          <span style={{ marginTop: 2 }}>{t("create")}</span>
        </button>

        <NavLink to="/chats" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {({ isActive }) => (
            <>
              <MessageSquare size={22} weight={isActive ? "fill" : "regular"} className="nav-item__icon" />
              <span>{t("chats")}</span>
            </>
          )}
        </NavLink>

        {isGuest ? guestSignInTab : (
          <FooterProfileTab profilePath="/profile" active={profileActive} />
        )}
      </nav>

      {sheet && (
        <>
          <div
            className="bottom-sheet-backdrop"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", zIndex: 200 }}
            onClick={() => setSheet(false)}
          />
          <div
            className="create-action-sheet"
            style={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: "var(--maxw)",
              background: "#ffffff",
              borderRadius: "28px 28px 0 0",
              padding: "10px 18px calc(30px + var(--safe-area-bottom))",
              zIndex: 201,
              boxShadow: "0 -8px 32px rgba(26, 21, 48, 0.16)",
              animation: "drawerSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div style={{ width: 44, height: 4, borderRadius: 2, background: "var(--ink-200)", margin: "8px auto 16px" }} />

            <div className="row between" style={{ marginBottom: 16, alignItems: "center" }}>
              <div>
                <span className="semi" style={{ fontSize: 17, color: "var(--ink-900)" }}>What would you like to do?</span>
                <p className="tiny muted" style={{ margin: "2px 0 0" }}>Share and connect with your neighborhood</p>
              </div>
              <button
                className="icon-btn"
                onClick={() => setSheet(false)}
                aria-label="Close modal"
                style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--ink-100)" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="col gap-10">
              <button
                className="card action-hub-card row gap-14"
                style={{ padding: "14px 16px", textAlign: "left", alignItems: "center" }}
                onClick={() => { setSheet(false); nav("/ask"); }}
              >
                <ActionIconBadge variant="amber" icon={Megaphone} size="md" />
                <div className="grow">
                  <div className="semi small" style={{ color: "var(--ink-900)" }}>Post a request</div>
                  <div className="tiny muted">Ask your street for help or a quote</div>
                </div>
                <ChevronRight size={18} className="action-hub-card__arrow muted" />
              </button>

              <button
                className="card action-hub-card row gap-14"
                style={{ padding: "14px 16px", textAlign: "left", alignItems: "center" }}
                onClick={() => { setSheet(false); nav("/story/new"); }}
              >
                <ActionIconBadge variant="sunset" icon={Camera} size="md" />
                <div className="grow">
                  <div className="semi small" style={{ color: "var(--ink-900)" }}>Share a story</div>
                  <div className="tiny muted">Share a photo moment with people on your street</div>
                </div>
                <ChevronRight size={18} className="action-hub-card__arrow muted" />
              </button>

              <button
                className="card action-hub-card row gap-14"
                style={{ padding: "14px 16px", textAlign: "left", alignItems: "center" }}
                onClick={() => { setSheet(false); nav("/community/new"); }}
              >
                <ActionIconBadge variant="emerald" icon={Users} size="md" />
                <div className="grow">
                  <div className="semi small" style={{ color: "var(--ink-900)" }}>Post to community</div>
                  <div className="tiny muted">Alert, shoutout, giveaway or lost & found</div>
                </div>
                <ChevronRight size={18} className="action-hub-card__arrow muted" />
              </button>

              <button
                className="card action-hub-card row gap-14"
                style={{ padding: "14px 16px", textAlign: "left", alignItems: "center" }}
                onClick={() => { setSheet(false); nav("/ask?groupBuy=1"); }}
              >
                <ActionIconBadge variant="cyan" icon={Package} size="md" />
                <div className="grow">
                  <div className="semi small" style={{ color: "var(--ink-900)" }}>Start a group buy</div>
                  <div className="tiny muted">Pool with neighbours to unlock a bulk price</div>
                </div>
                <ChevronRight size={18} className="action-hub-card__arrow muted" />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
