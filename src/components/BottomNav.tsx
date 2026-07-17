import { useState, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Home, Map, Plus, User, X } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import AccountSwitcher from "./AccountSwitcher";

export default function BottomNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const [sheet, setSheet] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const { t } = useI18n();
  const { isGuest } = useApp();
  const requireAuth = useRequireAuth();

  // Long-press (or right-click) the Profile tab to jump straight to the account
  // switcher; a normal tap opens the profile as usual.
  const pressTimer = useRef<number | undefined>(undefined);
  const wasLongPress = useRef(false);
  function pressStart() {
    wasLongPress.current = false;
    pressTimer.current = window.setTimeout(() => {
      wasLongPress.current = true;
      setSwitcher(true);
    }, 450);
  }
  function pressEnd() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  }
  function profileTap() {
    if (wasLongPress.current) { wasLongPress.current = false; return; }
    nav("/profile");
  }
  const profileActive = loc.pathname === "/profile";

  // A guest has no profile and no account to switch to — the tab becomes a
  // plain "Sign in" instead of a long-pressable identity control.
  const guestSignInTab = (
    <button
      className="nav-item"
      onClick={() => nav("/auth/phone")}
      aria-label={t("sign_in")}
    >
      <User size={22} strokeWidth={2} />
      <span>{t("sign_in")}</span>
    </button>
  );

  return (
    <>
      <nav className="bottom-nav">
        <NavLink to="/home" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {({ isActive }) => (
            <>
              <Home size={22} strokeWidth={isActive ? 2.6 : 2} />
              <span>{t("home")}</span>
            </>
          )}
        </NavLink>

        <NavLink to="/map" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {({ isActive }) => (
            <>
              <Map size={22} strokeWidth={isActive ? 2.6 : 2} />
              <span>{t("map")}</span>
            </>
          )}
        </NavLink>

        {/* Centre FAB — opens create sheet. Everything inside it (ask, story,
            community post) is sign-in-only, so gate the sheet itself rather than
            letting a guest open it and hit three dead ends. */}
        <button
          className="nav-item nav-fab"
          onClick={requireAuth(() => setSheet(true), "Sign in to post on your street")}
          aria-label="Create"
        >
          <span className="fab-circle"><Plus size={26} strokeWidth={2.6} /></span>
          <span style={{ marginTop: 2 }}>{t("create")}</span>
        </button>

        {isGuest ? guestSignInTab : (
          <button
            className={`nav-item ${profileActive ? "active" : ""}`}
            onClick={profileTap}
            onTouchStart={pressStart}
            onTouchEnd={pressEnd}
            onMouseDown={pressStart}
            onMouseUp={pressEnd}
            onMouseLeave={pressEnd}
            onContextMenu={(e) => { e.preventDefault(); setSwitcher(true); }}
            aria-label={`${t("profile")} — long-press to switch account`}
          >
            <User size={22} strokeWidth={profileActive ? 2.6 : 2} />
            <span>{t("profile")}</span>
          </button>
        )}
      </nav>

      {switcher && <AccountSwitcher onClose={() => setSwitcher(false)} />}

      {/* Create action sheet */}
      {sheet && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200 }}
            onClick={() => setSheet(false)}
          />
          <div style={{
            position: "fixed", bottom: 0,
            left: "50%", transform: "translateX(-50%)",
            width: "100%", maxWidth: "var(--maxw)",
            background: "#fff", borderRadius: "22px 22px 0 0",
            padding: "8px 16px calc(32px + var(--safe-area-bottom))",
            zIndex: 201,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
          }}>
            {/* Handle bar */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--ink-200)", margin: "8px auto 18px" }} />

            <div className="row between" style={{ marginBottom: 16 }}>
              <span className="semi" style={{ fontSize: 16 }}>What would you like to do?</span>
              <button className="icon-btn" onClick={() => setSheet(false)}><X size={18} /></button>
            </div>

            <div className="col gap-10">
              <button
                className="card row gap-14"
                style={{ padding: 16, textAlign: "left" }}
                onClick={() => { setSheet(false); nav("/ask"); }}
              >
                <span style={{ fontSize: 32, lineHeight: 1 }}>📋</span>
                <div className="grow">
                  <div className="semi small">Post a request</div>
                  <div className="tiny muted">Ask your street for help or a quote</div>
                </div>
              </button>

              <button
                className="card row gap-14"
                style={{ padding: 16, textAlign: "left" }}
                onClick={() => { setSheet(false); nav("/story/new"); }}
              >
                <span style={{ fontSize: 32, lineHeight: 1 }}>📸</span>
                <div className="grow">
                  <div className="semi small">Share a story</div>
                  <div className="tiny muted">Share a photo moment with people on your street</div>
                </div>
              </button>

              <button
                className="card row gap-14"
                style={{ padding: 16, textAlign: "left" }}
                onClick={() => { setSheet(false); nav("/community/new"); }}
              >
                <span style={{ fontSize: 32, lineHeight: 1 }}>🏘️</span>
                <div className="grow">
                  <div className="semi small">Post to community</div>
                  <div className="tiny muted">Alert, shoutout, giveaway or lost & found</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
