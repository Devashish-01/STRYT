import { useEffect } from "react";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";
import { useNavigate } from "react-router-dom";
import { MapPin, Store, Sparkles } from "@/components/Icons";
import { useApp } from "@/store";
import StreetScene from "@/components/StreetScene";
import BrandLockup from "@/components/BrandLockup";
import AppMark from "@/components/AppMark";

// Sign-in runs pre-auth with no location, so the header can't honestly show
// live weather/season. Instead the lamp burns at a fixed "dusk street" glow.
const LOGIN_GLOW = 0.85;

export default function Splash() {
  const nav = useNavigate();
  const { isAuthed } = useApp();

  useEffect(() => {
    if (isAuthed) nav("/home", { replace: true });
  }, [isAuthed, nav]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      {/* ── LEFT PANEL: brand hero (desktop only) ── */}
      <div
        className="splash-hero-panel"
        style={{
          flex: "0 0 52%",
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
            <BrandLockup glow={LOGIN_GLOW} size={40} ariaLabel="STRYT" />
          </div>

          <p style={{ fontSize:21, fontWeight:600, opacity:0.88, marginBottom:10, lineHeight:1.3 }}>Your street. Your people.</p>
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

          {/* Stat pills */}
          <div style={{ display:"flex", gap:10, marginTop:48, flexWrap:"wrap" }}>
            {["10K+ Locals", "500+ Services", "Real-time Queue"].map((label) => (
              <div key={label} style={{ background:"rgba(255,255,255,0.11)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:999, padding:"6px 16px", fontSize:12, fontWeight:700, backdropFilter:"blur(8px)", letterSpacing:"0.3px" }}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: CTA (full-screen on mobile) ── */}
      <div
        className="splash-cta-panel"
        style={{
          flex:1,
          background:"linear-gradient(160deg, var(--brand-50) 0%, var(--brand-100) 60%, var(--line) 100%)",
          display:"flex",
          flexDirection:"column",
          alignItems:"center",
          justifyContent:"center",
          position:"relative",
          overflow:"hidden",
          padding:"48px 32px",
          minHeight:"100vh",
        }}
      >
        {/* Soft blobs for right side */}
        <div style={{ position:"absolute", top:-60, left:-60, width:200, height:200, background:"var(--brand-400)", borderRadius:"50%", filter:"blur(60px)", opacity:0.18, pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-40, right:-40, width:180, height:180, background:"var(--accent-500)", borderRadius:"50%", filter:"blur(55px)", opacity:0.14, pointerEvents:"none" }} />

        {/* Mobile-only street scene — this panel turns into the coloured
            gradient on small screens (see .splash-cta-panel override below),
            so it gets the same dusk-street treatment there too. */}
        <span className="splash-street-mobile">
          <StreetScene />
        </span>

        {/* Mobile-only branding (hidden on desktop) */}
        <div className="splash-mobile-brand" style={{ textAlign:"center", marginBottom:36, position:"relative", zIndex:2 }}>
          <div style={{ display: "inline-block", marginBottom: 10, color: "#fff" }}>
            <BrandLockup glow={LOGIN_GLOW} size={30} ariaLabel="STRYT" />
          </div>
          <p className="splash-mobile-sub" style={{ fontSize:14.5, color:"var(--ink-600)", lineHeight:1.5, marginTop: 6 }}>Your street. Your people.</p>
        </div>

        {/* CTA card */}
        <div
          style={{
            background:"#fff",
            border:"1px solid var(--ink-200)",
            borderRadius:28,
            padding:"36px 28px",
            width:"100%",
            maxWidth:420,
            boxShadow:"var(--shadow-lg)",
            position:"relative",
            zIndex:2,
            textAlign:"center",
          }}
        >
          <div style={{ display:"flex", justifyContent:"center", marginTop:-56, marginBottom:16 }}>
            <AppMark size={64} style={{ border:"4px solid #fff" }} />
          </div>
          <h2 style={{ fontSize:22, fontWeight:800, color:"var(--ink-900)", marginBottom:8 }}>Join your street</h2>
          <p style={{ fontSize:13.5, color:"var(--ink-500)", marginBottom:28, lineHeight:1.55 }}>
            Connect with locals, discover services, and manage your bookings — all in one place.
          </p>

          <button
            style={{
              width:"100%",
              padding:"16px",
              borderRadius:16,
              background:"linear-gradient(135deg, var(--brand-500) 0%, var(--brand-700) 100%)",
              color:"#fff",
              fontWeight:800,
              fontSize:16,
              border:"none",
              cursor:"pointer",
              boxShadow:"0 8px 24px rgba(132,27,184,0.32)",
              marginBottom:12,
              transition:"all 0.2s",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              gap:8,
            }}
            onClick={() => nav("/auth/phone")}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 14px 36px rgba(132,27,184,0.42)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(132,27,184,0.32)"; }}
          >
            Get Started <span style={{ fontSize:18 }}>→</span>
          </button>

          <p style={{ fontSize:11, color:"var(--ink-400)", lineHeight:1.5 }}>
            By continuing you agree to our Terms &amp; Privacy Policy
          </p>
        </div>

        {/* APK download pill */}
        <div style={{ marginTop:22, position:"relative", zIndex:2 }}>
          <a
            href={APK_DOWNLOAD_URL}
            download={APK_FILENAME}
            style={{
              display:"inline-flex",
              alignItems:"center",
              gap:8,
              background:"rgba(255,255,255,0.75)",
              border:"1.5px solid var(--brand-200)",
              padding:"7px 18px",
              borderRadius:999,
              fontSize:12.5,
              fontWeight:700,
              color:"var(--brand-700)",
              textDecoration:"none",
              backdropFilter:"blur(8px)",
              boxShadow:"var(--shadow-sm)",
            }}
          >
            🤖 Download Android App
          </a>
        </div>
      </div>

      <style>{`
        .splash-street-mobile { display: none; }
        @media (min-width: 768px) {
          .splash-hero-panel { display: flex !important; }
          .splash-mobile-brand { display: none !important; }
        }
        @media (max-width: 767px) {
          .splash-hero-panel { display: none !important; }
          .splash-street-mobile { display: block; }
          .splash-cta-panel {
            background: linear-gradient(160deg, var(--brand-500) 0%, var(--brand-700) 55%, var(--ink-800) 100%) !important;
          }
          .splash-cta-panel > div[style*="background:#fff"] {
            background: rgba(255,255,255,0.96) !important;
          }
          .splash-mobile-sub { color: rgba(255,255,255,0.75) !important; }
        }
      `}</style>
    </div>
  );
}

