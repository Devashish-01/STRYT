import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { authService } from "@/services";
import { Mail } from "lucide-react";
import { useApp } from "@/store";

export default function PhoneEntry() {
  const nav = useNavigate();
  const { showToast } = useApp();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const emailValid = email.includes("@") && email.split("@")[1]?.includes(".");
  const phoneValid = phone.replace(/\D/g, "").length === 10;

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

  async function handleEmailLogin() {
    if (!emailValid) return;
    setLoading(true);
    try {
      await authService.sendEmailOtp(email);
      sessionStorage.setItem("otp_phone", email);
      nav("/auth/otp", { state: { phone: email } });
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't send email code.";
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handlePhoneLogin() {
    if (!phoneValid) return;
    setLoading(true);
    try {
      await authService.sendOtp(phone);
      sessionStorage.setItem("otp_phone", phone);
      nav("/auth/otp", { state: { phone } });
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't send SMS.";
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <AppBar onBack={() => nav("/")} />
      <div className="screen-scroll page-pad" style={{ paddingBottom: 40 }}>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Welcome to STRYT</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 15, lineHeight: 1.5 }}>
            Your street. Your people. Sign up or log in.
          </p>
        </div>

        {/* Google OAuth Button */}
        <div style={{ marginTop: 32 }}>
          <button
            className="btn btn-outline btn-block row center gap-12"
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              padding: "14px",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-sm)",
              background: "#fff",
              border: "1.5px solid var(--ink-200)",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Phone Entry — primary for India */}
        <div className="col gap-12" style={{ marginTop: 28 }}>
          <div
            className="row"
            style={{
              border: "1.5px solid var(--ink-200)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <span
              className="row gap-6 semi tiny"
              style={{
                padding: "12px 14px",
                borderRight: "1.5px solid var(--ink-200)",
                background: "var(--ink-50)",
                flexShrink: 0,
              }}
            >
              🇮🇳 +91
            </span>
            <input
              className="input"
              style={{ border: "none", flex: 1, padding: "12px 14px", fontSize: 16 }}
              inputMode="numeric"
              maxLength={10}
              placeholder="Mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              disabled={loading}
              autoFocus
            />
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={!phoneValid || loading}
            onClick={handlePhoneLogin}
          >
            {loading ? "Sending OTP…" : "Get OTP"}
          </button>
        </div>

        {/* Divider */}
        <div className="row center gap-12 muted small" style={{ margin: "24px 0" }}>
          <span style={{ flex: 1, height: 1.5, background: "var(--ink-100)" }} />
          <span>or</span>
          <span style={{ flex: 1, height: 1.5, background: "var(--ink-100)" }} />
        </div>

        {/* Email */}
        <div className="col gap-12">
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Mail size={14} /> Email Address
            </label>
            <input
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            className="btn btn-outline btn-block"
            disabled={!emailValid || loading}
            onClick={handleEmailLogin}
          >
            {loading ? "Sending…" : "Send Email Code"}
          </button>
        </div>

      </div>
    </div>
  );
}
