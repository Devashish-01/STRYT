import { useState } from "react";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";

import { useNavigate } from "react-router-dom";
import { authService } from "@/services";
import { ArrowLeft, Loader } from "@/components/Icons";
import { useApp } from "@/store";
import { Capacitor } from "@capacitor/core";
import StreetScene from "@/components/StreetScene";
import BrandLockup from "@/components/BrandLockup";
import AppMark from "@/components/AppMark";

// Pre-auth (no location) → the lamp burns at a fixed "dusk street" glow rather
// than pretending to know the local time/weather.
const LOGIN_GLOW = 0.85;

// Number/email login is hidden for the live launch — Google is the only
// sign-in method until phone/email OTP is reintroduced. See GOAL_LIVE.md.

export default function PhoneEntry() {
  const nav = useNavigate();
  const { showToast } = useApp();
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setLoading(true);
    try {
      await authService.signInWithGoogle();
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Google sign-in failed.";
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      {/* ── LEFT PANEL: trust / brand (desktop only) ── */}
      <div
        className="login-hero-panel"
        style={{
          flex: "0 0 50%",
          background: "linear-gradient(145deg, var(--brand-700) 0%, var(--brand-900) 50%, var(--ink-900) 100%)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 56px",
          color: "#fff",
        }}
      >
        {/* Blobs */}
        <div style={{ position:"absolute", top:-60, left:-60, width:280, height:280, background:"var(--brand-400)", borderRadius:"50%", filter:"blur(90px)", opacity:0.28, pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-50, right:-40, width:240, height:240, background:"var(--accent-500)", borderRadius:"50%", filter:"blur(80px)", opacity:0.22, pointerEvents:"none" }} />

        {/* Quiet dusk-street skyline — brand ambience, no weather claim */}
        <StreetScene />

        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ marginBottom: 48 }}>
            <BrandLockup glow={LOGIN_GLOW} size={26} onClick={() => nav("/")} />
          </div>

          <h2 style={{ fontSize:36, fontWeight:900, letterSpacing:-1.5, lineHeight:1.1, marginBottom:16, color:"#fff" }}>
            Welcome back<br />to your street
          </h2>
          <p style={{ fontSize:15, opacity:0.65, lineHeight:1.7, maxWidth:340, marginBottom:52 }}>
            Sign in to manage your bookings, connect with locals, and discover everything your street has to offer.
          </p>

          {/* Trust badges */}
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {[
              { emoji:"🔒", title:"Secure sign-in", text:"Your data is protected end-to-end" },
              { emoji:"⚡", title:"One-tap access", text:"Continue with Google in seconds" },
              { emoji:"🏘️", title:"Local-first", text:"Everything stays close to home" },
            ].map(({ emoji, title, text }) => (
              <div key={title} style={{ display:"flex", alignItems:"center", gap:16 }}>
                <div style={{ width:42, height:42, borderRadius:12, background:"rgba(255,255,255,0.11)", border:"1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:18 }}>
                  {emoji}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{title}</div>
                  <div style={{ opacity:0.6, fontSize:12.5 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Stat row */}
          <div style={{ display:"flex", gap:28, marginTop:52, paddingTop:28, borderTop:"1px solid rgba(255,255,255,0.12)" }}>
            {[["10K+","Locals"], ["500+","Services"], ["4.9★","Rating"]].map(([val, label]) => (
              <div key={label}>
                <div style={{ fontSize:22, fontWeight:900, letterSpacing:-1 }}>{val}</div>
                <div style={{ fontSize:11, opacity:0.55, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: auth card ── */}
      <div
        className="login-form-panel"
        style={{
          flex: 1,
          background: "linear-gradient(160deg, var(--brand-50) 0%, var(--brand-100) 60%, var(--line) 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          padding: "48px 32px",
          minHeight: "100vh",
        }}
      >
        {/* Soft blobs */}
        <div style={{ position:"absolute", top:-50, left:-50, width:220, height:220, background:"var(--brand-400)", borderRadius:"50%", filter:"blur(60px)", opacity:0.17, pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-30, right:-30, width:180, height:180, background:"var(--accent-500)", borderRadius:"50%", filter:"blur(50px)", opacity:0.14, pointerEvents:"none" }} />

        {/* Mobile-only street scene — this panel turns coloured on small
            screens (see .login-form-panel override below). */}
        <span className="login-street-mobile">
          <StreetScene />
        </span>

        {/* Mobile-only back button (hidden on desktop) */}
        <div className="login-mobile-header" style={{ position:"absolute", top:20, left:20, zIndex:10 }}>
          <button
            onClick={() => nav("/")}
            style={{ background:"#fff", border:"1px solid var(--ink-200)", borderRadius:"50%", width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"var(--ink-700)", boxShadow:"var(--shadow-sm)" }}
          >
            <ArrowLeft size={17} />
          </button>
        </div>

        {/* Mobile-only brand */}
        <div className="login-mobile-brand" style={{ textAlign:"center", marginBottom:28, position:"relative", zIndex:2, display: "inline-flex", color: "#fff" }}>
          <BrandLockup glow={LOGIN_GLOW} size={24} onClick={() => nav("/")} />
        </div>

        {/* Main auth card */}
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--ink-200)",
            borderRadius: 28,
            padding: "32px 28px",
            width: "100%",
            maxWidth: 440,
            boxShadow: "var(--shadow-lg)",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Desktop back button inside card header */}
          <div className="login-desktop-back" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
            <button
              onClick={() => nav("/")}
              style={{ background:"var(--ink-50)", border:"1px solid var(--ink-200)", borderRadius:10, width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"var(--ink-600)", flexShrink:0 }}
            >
              <ArrowLeft size={16} />
            </button>
            <AppMark size={38} radius={11} shadow={false} />
            <div>
              <div style={{ fontWeight:800, fontSize:17, color:"var(--ink-900)" }}>Sign in to STRYT</div>
              <div style={{ fontSize:12, color:"var(--ink-500)", marginTop:1 }}>Continue with your Google account</div>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{ width:"100%", padding:"15px", borderRadius:16, background:"#fff", border:"1.5px solid var(--ink-200)", color:"var(--ink-900)", fontSize:14.5, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:12, cursor:"pointer", boxShadow:"var(--shadow-sm)", transition:"all 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1.5px)"; e.currentTarget.style.boxShadow = "var(--shadow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
            >
              {loading ? (
                <Loader className="spin" size={18} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
              )}
              Continue with Google
            </button>

            {/* 🏪 Business Merchant Fast Entrance */}
            <div style={{ textAlign: "center", marginTop: 8, paddingTop: 12, borderTop: "1px dashed var(--ink-200)" }}>
              <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 8, fontWeight: 600 }}>Are you a Shop Owner or Service Provider?</div>
              <button
                onClick={() => nav("/business/onboard")}
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  borderRadius: 12,
                  background: "var(--brand-50)",
                  border: "1.5px solid var(--brand-300)",
                  color: "var(--brand-800)",
                  fontSize: 13,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                🗺️ Import &amp; List Shop from Google Maps
              </button>
            </div>
          </div>
        </div>

        {/* Download pill */}
        {!Capacitor.isNativePlatform() && (
          <div style={{ marginTop:20, position:"relative", zIndex:2 }}>
            <a href={APK_DOWNLOAD_URL} download={APK_FILENAME} style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.75)", border:"1.5px solid var(--brand-200)", padding:"7px 18px", borderRadius:999, fontSize:12.5, fontWeight:700, color:"var(--brand-700)", textDecoration:"none", backdropFilter:"blur(8px)", boxShadow:"var(--shadow-sm)" }}>

              🤖 Download Android App
            </a>
          </div>
        )}

        <span style={{ marginTop:16, fontSize:11, color:"var(--ink-400)", textAlign:"center", lineHeight:1.5, position:"relative", zIndex:2 }}>
          Secured by STRYT Authentication.<br />By continuing, you agree to our Terms &amp; Privacy Policy.
        </span>
      </div>

      <style>{`
        .login-street-mobile { display: none; }
        @media (min-width: 768px) {
          .login-hero-panel { display: flex !important; }
          .login-mobile-brand { display: none !important; }
          .login-mobile-header { display: none !important; }
          .login-desktop-back { display: flex !important; }
        }
        @media (max-width: 767px) {
          .login-hero-panel { display: none !important; }
          .login-desktop-back { display: none !important; }
          .login-street-mobile { display: block; }
          .login-form-panel {
            background: linear-gradient(160deg, var(--brand-500) 0%, var(--brand-700) 55%, var(--ink-800) 100%) !important;
          }
          .login-form-panel > div[style*="background:#fff"],
          .login-form-panel > div[style*="background: #fff"] {
            background: rgba(255,255,255,0.97) !important;
          }
        }
      `}</style>
    </div>
  );
}

