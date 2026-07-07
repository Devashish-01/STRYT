import { useEffect } from "react";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";
import { useNavigate } from "react-router-dom";
import { MapPin, Store, Sparkles } from "@/components/Icons";
import { useApp } from "@/store";

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

        <div style={{ position: "relative", zIndex: 2 }}>
          {/* Logo */}
          <div style={{ width:72, height:72, borderRadius:22, background:"rgba(255,255,255,0.13)", border:"1.5px solid rgba(255,255,255,0.28)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:32, backdropFilter:"blur(8px)" }}>
            <svg width="44" height="44" viewBox="0 0 64 64">
              <path d="M32 11 C21.5 11 13 19.5 13 30 C13 43 32 56 32 56 C32 56 51 43 51 30 C51 19.5 42.5 11 32 11 Z" fill="#fff" />
              <path d="M32 41 C24 35 40 24 32 17" stroke="var(--brand-600)" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M32 41 C24 35 40 24 32 17" stroke="var(--accent-400)" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeDasharray="0.5 3.8" />
            </svg>
          </div>

          <h1 style={{ fontSize:52, fontWeight:900, letterSpacing:-2, lineHeight:1, marginBottom:14 }}>STRYT</h1>
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

        {/* Mobile-only branding (hidden on desktop) */}
        <div className="splash-mobile-brand" style={{ textAlign:"center", marginBottom:36, position:"relative", zIndex:2 }}>
          <div style={{ width:64, height:64, borderRadius:20, background:"linear-gradient(135deg, var(--brand-500) 0%, var(--brand-700) 100%)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:"0 8px 28px rgba(109,40,217,0.3)" }}>
            <svg width="38" height="38" viewBox="0 0 64 64">
              <path d="M32 11 C21.5 11 13 19.5 13 30 C13 43 32 56 32 56 C32 56 51 43 51 30 C51 19.5 42.5 11 32 11 Z" fill="#fff" />
              <path d="M32 41 C24 35 40 24 32 17" stroke="var(--brand-600)" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M32 41 C24 35 40 24 32 17" stroke="var(--accent-400)" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeDasharray="0.5 3.8" />
            </svg>
          </div>
          <h1 className="splash-mobile-title" style={{ fontSize:34, fontWeight:900, letterSpacing:-1, color:"var(--ink-900)", marginBottom:8 }}>STRYT</h1>
          <p className="splash-mobile-sub" style={{ fontSize:14.5, color:"var(--ink-600)", lineHeight:1.5 }}>Your street. Your people.</p>
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
              boxShadow:"0 8px 24px rgba(109,40,217,0.32)",
              marginBottom:12,
              transition:"all 0.2s",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              gap:8,
            }}
            onClick={() => nav("/auth/phone")}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 14px 36px rgba(109,40,217,0.42)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(109,40,217,0.32)"; }}
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
        @media (min-width: 768px) {
          .splash-hero-panel { display: flex !important; }
          .splash-mobile-brand { display: none !important; }
        }
        @media (max-width: 767px) {
          .splash-hero-panel { display: none !important; }
          .splash-cta-panel {
            background: linear-gradient(160deg, var(--brand-500) 0%, var(--brand-700) 55%, var(--ink-800) 100%) !important;
          }
          .splash-cta-panel > div[style*="background:#fff"] {
            background: rgba(255,255,255,0.96) !important;
          }
          .splash-mobile-title { color: #fff !important; }
          .splash-mobile-sub { color: rgba(255,255,255,0.75) !important; }
        }
      `}</style>
    </div>
  );
}

