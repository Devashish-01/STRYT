import { useState } from "react";
import GoogleSignIn from "@/components/GoogleSignIn";
import { APK_DOWNLOAD_URL, APK_FILENAME } from "@/lib/apkDownload";

import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader } from "@/components/Icons";
import { Capacitor } from "@capacitor/core";
import StreetScene from "@/components/StreetScene";
import BrandLockup from "@/components/BrandLockup";
import AppMark from "@/components/AppMark";
import { authService } from "@/services";
import { useI18n } from "@/lib/i18n";
import { otpErrorText } from "@/lib/authErrors";
import { LEGAL_ROUTES } from "@/lib/legal";

// Pre-auth (no location) → the lamp burns at a fixed "dusk street" glow rather
// than pretending to know the local time/weather.
const LOGIN_GLOW = 0.85;

export default function PhoneEntry() {
  const nav = useNavigate();
  const { t, tf } = useI18n();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const phoneValid = phone.trim().length === 10;

  async function handleSendOtp() {
    if (!phoneValid || loading) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const { autoVerified } = await authService.sendOtp(phone);
      sessionStorage.setItem("otp_phone", phone);
      nav("/auth/otp", { state: { phone, autoVerified } });
    } catch (err) {
      setErrorMsg(otpErrorText(err, t, tf));
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

        </div>
      </div>

      {/* ── RIGHT PANEL: on phones this is a brand hero with a bottom sheet; on desktop a centred card ── */}
      <div className="login-form-panel">
        <button type="button" className="login-back" onClick={() => nav("/")} aria-label={t("back_word")}>
          <ArrowLeft size={20} />
        </button>

        {/* Phones only: the lamp lockup owns the space above the sheet. */}
        <div className="login-mobile-brand">
          <span className="login-street-mobile">
            <StreetScene />
          </span>
          <div className="login-lockup">
            <BrandLockup glow={LOGIN_GLOW} size={34} onClick={() => nav("/")} />
          </div>
        </div>

        <div className="login-card">
          <div className="login-sheet-handle" aria-hidden="true" />

          {/* Desktop card header (phones show the lockup above instead) */}
          <div className="login-desktop-back">
            <AppMark size={38} radius={11} shadow={false} />
            <div>
              <div className="login-card-title">Sign in to STRYT</div>
              <div className="login-card-sub">{t("login_welcome_sub")}</div>
            </div>
          </div>

          <div className="login-mobile-title">
            <h1>{t("login_welcome_title")}</h1>
            <p>{t("login_welcome_sub")}</p>
          </div>

          <form
            className="login-form"
            onSubmit={(e) => { e.preventDefault(); void handleSendOtp(); }}
            noValidate
          >
            <div className={`login-phone${errorMsg ? " has-error" : ""}`}>
              <span className="login-phone-cc" aria-hidden="true">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                className="login-phone-input"
                placeholder={t("login_phone_placeholder")}
                aria-label={t("login_phone_label")}
                aria-invalid={Boolean(errorMsg)}
                aria-describedby={errorMsg ? "login-phone-error" : undefined}
                value={phone}
                onChange={(e) => {
                  setErrorMsg("");
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                }}
                maxLength={10}
                disabled={loading}
              />
            </div>

            {errorMsg && (
              <div id="login-phone-error" className="login-error" role="alert">
                {errorMsg}
              </div>
            )}

            <button type="submit" className="login-cta" disabled={!phoneValid || loading}>
              {loading ? <Loader className="spin" size={20} /> : (
                <>
                  <span>{t("login_continue")}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="login-divider"><span>{t("login_or")}</span></div>

          <GoogleSignIn showLegal={false} />

          {/* One compact legal line instead of a paragraph under the Google button */}
          <p className="login-legal">
            {t("login_legal_prefix")}{" "}
            <Link to={LEGAL_ROUTES.terms}>{t("login_link_terms")}</Link>{" "}{t("login_legal_and")}{" "}
            <Link to={LEGAL_ROUTES.privacy}>{t("login_link_privacy")}</Link>
          </p>

          {!Capacitor.isNativePlatform() && (
            <a className="login-apk" href={APK_DOWNLOAD_URL} download={APK_FILENAME}>
              {t("login_get_android")}
            </a>
          )}

          {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
          <div id="recaptcha-container"></div>
        </div>
      </div>
    </div>
  );
}

