import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Home, Compass, Plus, Users, User, X } from "lucide-react";
import { useApp } from "@/store";

export default function BottomNav() {
  const nav = useNavigate();
  const { chatUnread } = useApp();
  const [sheet, setSheet] = useState(false);

  return (
    <>
      <nav className="bottom-nav">
        <NavLink to="/home" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {({ isActive }) => (
            <>
              <Home size={22} strokeWidth={isActive ? 2.6 : 2} />
              <span>Home</span>
            </>
          )}
        </NavLink>

        <NavLink to="/explore" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {({ isActive }) => (
            <>
              <Compass size={22} strokeWidth={isActive ? 2.6 : 2} />
              <span>Explore</span>
            </>
          )}
        </NavLink>

        {/* Centre FAB — opens create sheet */}
        <button className="nav-item nav-fab" onClick={() => setSheet(true)} aria-label="Create">
          <span className="fab-circle"><Plus size={26} strokeWidth={2.6} /></span>
          <span style={{ marginTop: 2 }}>Create</span>
        </button>

        <NavLink to="/community-hub" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {({ isActive }) => (
            <>
              <span style={{ position: "relative", display: "inline-flex" }}>
                <Users size={22} strokeWidth={isActive ? 2.6 : 2} />
                {chatUnread > 0 && (
                  <span className="nav-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>
                )}
              </span>
              <span>Community</span>
            </>
          )}
        </NavLink>

        <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {({ isActive }) => (
            <>
              <User size={22} strokeWidth={isActive ? 2.6 : 2} />
              <span>You</span>
            </>
          )}
        </NavLink>
      </nav>

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
            padding: "8px 16px 32px",
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
                  <div className="tiny muted">Ask your neighborhood for help or a quote</div>
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
                  <div className="tiny muted">Share a photo moment with neighbors nearby</div>
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
