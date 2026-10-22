import GoogleSignIn from "@/components/GoogleSignIn";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, Store, Sparkles } from "@/components/Icons";
import StreetScene from "@/components/StreetScene";
import BrandLockup from "@/components/BrandLockup";
import AppMark from "@/components/AppMark";
import { useI18n } from "@/lib/i18n";
import { LEGAL_ROUTES } from "@/lib/legal";

// Sign-in runs pre-auth with no location, so the header can't honestly show
// live weather/season. Instead the lamp burns at a fixed "dusk street" glow.
const LOGIN_GLOW = 0.85;

export default function Splash() {
  const nav = useNavigate();
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      {/* ── LEFT PANEL: brand hero (desktop only) ── */}
      <div
        className="splash-hero-panel"
        style={{
          flex: "0 0 50%",
          background: "linear-gradient(145deg, var(--brand-500) 0%, var(--brand-700) 45%, var(--ink-800) 100%)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 56px",
          color: "#fff",
        }}
      >
        {/* Ambient blobs */}
        <div style={{ position:"absolute", top:-80, left:-80, width:300, height:300, background:"var(--brand-400)", borderRadius:"50%", filter:"blur(90px)", opacity:0.3, pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-60, right:-40, width:260, height:260, background:"var(--accent-500)", borderRadius:"50%", filter:"blur(80px)", opacity:0.25, pointerEvents:"none" }} />

        {/* A quiet "your street at dusk" skyline — brand ambience with no
            weather claim (pre-auth = no location to read a season from). */}
        <StreetScene />

        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ marginBottom: 28 }}>
            <BrandLockup glow={LOGIN_GLOW} size={40} withTagline ariaLabel="STRYT" />
          </div>

          <p style={{ fontSize:14.5, opacity:0.62, lineHeight:1.75, maxWidth:360, marginBottom:52 }}>
            Discover what's on your street, offer what you do, and ask for what you need — all in one app.
          </p>

          {/* Feature list */}
          <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
            {[
              { icon: <Store size={20} />, title: "Discover local spots", text: "See what just opened on your street" },
              { icon: <Sparkles size={20} />, title: "Find trusted people", text: "Plumbers, tutors, makeup artists & more" },
              { icon: <MapPin size={20} />, title: "Ask your street", text: "Post a need, get offers nearby" },
            ].map(({ icon, title, text }) => (
              <div key={title} style={{ display:"flex", alignItems:"center", gap:16 }}>
                <div style={{ width:44, height:44, borderRadius:14, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {icon}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{title}</div>
                  <div style={{ opacity:0.62, fontSize:13 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Feature pills — no unverified user counts */}
          <div style={{ display:"flex", gap:10, marginTop:48, flexWrap:"wrap" }}>
            {["Local discovery", "Trusted providers", "Street requests"].map((label) => (
              <div key={label} style={{ background:"rgba(255,255,255,0.11)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:999, padding:"6px 16px", fontSize:12, fontWeight:700, backdropFilter:"blur(8px)", letterSpacing:"0.3px" }}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: phones get the same hero + bottom sheet as sign-in; desktop gets a centred card ── */}
      <div className="login-form-panel">
        <div className="login-mobile-brand">
          <span className="login-street-mobile">
            <StreetScene />
          </span>
          <div className="login-lockup">
            <BrandLockup glow={LOGIN_GLOW} size={34} withTagline ariaLabel="STRYT" />
          </div>
        </div>

        <div className="login-card">
          <div className="login-sheet-handle" aria-hidden="true" />

          <div className="login-desktop-back">
            <AppMark size={38} radius={11} shadow={false} />
            <div>
              <div className="login-card-title">{t("welcome_title")}</div>
              <div className="login-card-sub">{t("welcome_sub")}</div>
            </div>
          </div>

          <div className="login-mobile-title">
            <h1>{t("welcome_title")}</h1>
            <p>{t("welcome_sub")}</p>
          </div>

          <button type="button" className="login-cta" onClick={() => nav("/auth/phone")}>
            <span>{t("welcome_phone")}</span>
            <ArrowRight size={18} />
          </button>

          <div className="login-divider"><span>{t("login_or")}</span></div>

          <GoogleSignIn showLegal={false} />

          {/* The guest-mode door. A stranger won't create an account for a street they can't see yet. */}
          <button type="button" className="login-ghost" onClick={() => nav("/home")}>
            {t("welcome_look")}
          </button>

          <p className="login-legal">
            {t("login_legal_prefix")}{" "}
            <Link to={LEGAL_ROUTES.terms}>{t("login_link_terms")}</Link>{" "}{t("login_legal_and")}{" "}
            <Link to={LEGAL_ROUTES.privacy}>{t("login_link_privacy")}</Link>
          </p>

          <a className="login-apk" href={APK_DOWNLOAD_URL} download={APK_FILENAME}>
            {t("login_get_android")}
          </a>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) { .splash-hero-panel { display: flex !important; } }
        @media (max-width: 767px) { .splash-hero-panel { display: none !important; } }
      `}</style>
    </div>
  );
}

