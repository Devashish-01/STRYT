import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/services";
import { Mail, Phone as PhoneIcon, ArrowLeft, ArrowRight, Loader, Lock } from "lucide-react";
import { useApp } from "@/store";
import { returnTo } from "@/lib/returnTo";

export default function PhoneEntry() {
  const nav = useNavigate();
  const { showToast, signIn } = useApp();
  const [showOther, setShowOther] = useState(false);
  const [tab, setTab] = useState<"phone" | "email">("phone");
  const [emailMode, setEmailMode] = useState<"code" | "password">("code");
  const [authAction, setAuthAction] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const emailValid = email.includes("@") && email.split("@")[1]?.includes(".");
  const phoneValid = phone.replace(/\D/g, "").length === 10;
  const passwordValid = password.length >= 6;

  async function handlePasswordAuth() {
    if (!emailValid || !passwordValid) return;
    setLoading(true);
    try {
      const res = authAction === "signin"
        ? await authService.signInWithPassword(email, password)
        : await authService.signUpWithPassword(email, password);
      if (res.hasSession) {
        signIn();
        nav(returnTo.consume(), { replace: true });
      } else {
        showToast("Check your email to confirm your account, then sign in.");
        setAuthAction("signin");
      }
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't sign in with password.";
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }

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
    <div
      className="screen"
      style={{
        background: "linear-gradient(160deg, #fdfbff 0%, #f5eefc 60%, #ece2f7 100%)",
        color: "var(--ink-900)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "24px 20px 48px",
      }}
    >
      {/* Soft Glow Blobs */}
      <div
        style={{
          position: "absolute",
          top: "-5%",
          left: "-5%",
          width: "240px",
          height: "240px",
          background: "rgba(139, 71, 245, 0.15)",
          borderRadius: "50%",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "15%",
          right: "-5%",
          width: "200px",
          height: "200px",
          background: "rgba(255, 149, 0, 0.12)",
          borderRadius: "50%",
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />

      {/* Header Back Button */}
      <div className="row" style={{ zIndex: 10 }}>
        <button
          onClick={() => (showOther ? setShowOther(false) : nav("/"))}
          style={{
            background: "#fff",
            border: "1px solid var(--ink-200)",
            borderRadius: "50%",
            width: 42,
            height: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--ink-700)",
            boxShadow: "var(--shadow-sm)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--ink-50)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      {/* Hero / Logo section */}
      <div className="col center" style={{ zIndex: 10, marginTop: 24, textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "linear-gradient(135deg, var(--brand-500) 0%, var(--brand-600) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgba(124, 58, 237, 0.2)",
            marginBottom: 20,
          }}
        >
          <svg width="34" height="34" viewBox="0 0 64 64">
            <path d="M32 11 C21.5 11 13 19.5 13 30 C13 43 32 56 32 56 C32 56 51 43 51 30 C51 19.5 42.5 11 32 11 Z" fill="#fff" />
            <path d="M32 41 C24 35 40 24 32 17" stroke="var(--brand-600)" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M32 41 C24 35 40 24 32 17" stroke="#ffb020" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeDasharray="0.5 3.8" />
          </svg>
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1, color: "var(--ink-900)" }}>
          Welcome to STRYT
        </h1>
        <p style={{ fontSize: 15, color: "var(--ink-600)", marginTop: 6, maxWidth: 280, lineHeight: 1.4 }}>
          Connect with trusted local neighbors, businesses, & services instantly.
        </p>
      </div>

      {/* Main White card */}
      <div
        style={{
          zIndex: 10,
          background: "#fff",
          border: "1px solid var(--ink-200)",
          borderRadius: 28,
          padding: "28px 20px",
          width: "100%",
          boxShadow: "var(--shadow-lg)",
          marginTop: 24,
        }}
      >
        {!showOther ? (
          // Google focus screen
          <div className="col gap-14">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: 16,
                background: "#fff",
                border: "1.5px solid var(--ink-200)",
                color: "var(--ink-900)",
                fontSize: 15,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                cursor: "pointer",
                boxShadow: "var(--shadow-sm)",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1.5px)";
                e.currentTarget.style.boxShadow = "var(--shadow)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "var(--shadow-sm)";
              }}
            >
              {loading ? (
                <Loader className="spin" size={18} />
              ) : (
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
              )}
              Continue with Google
            </button>

            <button
              onClick={() => setShowOther(true)}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: 16,
                background: "var(--ink-50)",
                border: "1px solid var(--ink-200)",
                color: "var(--ink-700)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--ink-100)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--ink-50)")}
            >
              Other options
            </button>
          </div>
        ) : (
          // Phone/Email tabs
          <div className="col">
            {/* Tab Switcher */}
            <div
              style={{
                background: "var(--ink-100)",
                borderRadius: 14,
                padding: 4,
                display: "flex",
                gap: 4,
                marginBottom: 20,
                border: "1px solid var(--ink-200)",
              }}
            >
              <button
                type="button"
                onClick={() => setTab("phone")}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: tab === "phone" ? "#fff" : "transparent",
                  color: tab === "phone" ? "var(--brand-700)" : "var(--ink-500)",
                  boxShadow: tab === "phone" ? "var(--shadow-sm)" : "none",
                  transition: "all 0.2s",
                }}
              >
                <PhoneIcon size={14} /> Mobile Phone
              </button>
              <button
                type="button"
                onClick={() => setTab("email")}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: tab === "email" ? "#fff" : "transparent",
                  color: tab === "email" ? "var(--brand-700)" : "var(--ink-500)",
                  boxShadow: tab === "email" ? "var(--shadow-sm)" : "none",
                  transition: "all 0.2s",
                }}
              >
                <Mail size={14} /> Email Address
              </button>
            </div>

            {/* Tab Contents */}
            {tab === "phone" ? (
              <div className="col gap-14">
                <div
                  className="row"
                  style={{
                    background: "#fff",
                    border: "1.5px solid var(--ink-200)",
                    borderRadius: 16,
                    overflow: "hidden",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      padding: "14px 16px",
                      borderRight: "1.5px solid var(--ink-200)",
                      background: "var(--ink-50)",
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--ink-600)",
                    }}
                  >
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    className="input"
                    style={{
                      border: "none",
                      background: "transparent",
                      flex: 1,
                      padding: "14px 16px",
                      fontSize: 16,
                      color: "var(--ink-900)",
                      outline: "none",
                    }}
                    placeholder="Enter mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    maxLength={10}
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <button
                  onClick={handlePhoneLogin}
                  disabled={!phoneValid || loading}
                  className="btn btn-primary btn-block row center gap-8"
                  style={{ padding: 15, borderRadius: 16, fontWeight: 700, fontSize: 15 }}
                >
                  {loading ? <Loader className="spin" size={18} /> : <>Get Verification Code <ArrowRight size={16} /></>}
                </button>
              </div>
            ) : (
              <div className="col gap-14">
                <div
                  className="row"
                  style={{
                    background: "#fff",
                    border: "1.5px solid var(--ink-200)",
                    borderRadius: 16,
                    overflow: "hidden",
                    alignItems: "center",
                  }}
                >
                  <span style={{ paddingLeft: 16, display: "flex", alignItems: "center", color: "var(--ink-400)" }}>
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    className="input"
                    style={{
                      border: "none",
                      background: "transparent",
                      flex: 1,
                      padding: "14px 16px",
                      fontSize: 16,
                      color: "var(--ink-900)",
                      outline: "none",
                    }}
                    placeholder="Enter email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                </div>

                {emailMode === "password" && (
                  <div
                    className="row"
                    style={{
                      background: "#fff",
                      border: "1.5px solid var(--ink-200)",
                      borderRadius: 16,
                      overflow: "hidden",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ paddingLeft: 16, display: "flex", alignItems: "center", color: "var(--ink-400)" }}>
                      <Lock size={16} />
                    </span>
                    <input
                      type="password"
                      className="input"
                      style={{
                        border: "none",
                        background: "transparent",
                        flex: 1,
                        padding: "14px 16px",
                        fontSize: 16,
                        color: "var(--ink-900)",
                        outline: "none",
                      }}
                      placeholder="Password (min 6 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                )}

                <button
                  onClick={emailMode === "code" ? handleEmailLogin : handlePasswordAuth}
                  disabled={emailMode === "code" ? (!emailValid || loading) : (!emailValid || !passwordValid || loading)}
                  className="btn btn-primary btn-block row center gap-8"
                  style={{ padding: 15, borderRadius: 16, fontWeight: 700, fontSize: 15 }}
                >
                  {loading ? (
                    <Loader className="spin" size={18} />
                  ) : emailMode === "code" ? (
                    <>Get Verification Code <ArrowRight size={16} /></>
                  ) : authAction === "signin" ? (
                    <>Sign In <ArrowRight size={16} /></>
                  ) : (
                    <>Create Account <ArrowRight size={16} /></>
                  )}
                </button>

                <div className="row between" style={{ fontSize: 12.5 }}>
                  <button
                    type="button"
                    onClick={() => setEmailMode((m) => (m === "code" ? "password" : "code"))}
                    style={{ background: "none", border: "none", color: "var(--brand-700)", fontWeight: 600, cursor: "pointer" }}
                  >
                    {emailMode === "code" ? "Use password instead" : "Use verification code instead"}
                  </button>
                  {emailMode === "password" && (
                    <button
                      type="button"
                      onClick={() => setAuthAction((a) => (a === "signin" ? "signup" : "signin"))}
                      style={{ background: "none", border: "none", color: "var(--ink-500)", fontWeight: 600, cursor: "pointer" }}
                    >
                      {authAction === "signin" ? "New here? Create account" : "Have an account? Sign in"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Back to Google */}
            <button
              onClick={() => setShowOther(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--ink-500)",
                fontSize: 13,
                fontWeight: 600,
                marginTop: 20,
                alignSelf: "center",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Back to Google login
            </button>
          </div>
        )}
      </div>

      {/* Safety Policy Label */}
      <span className="tiny" style={{ textAlign: "center", color: "var(--ink-500)", zIndex: 10, lineHeight: 1.4 }}>
        Secured by STRYT Authentication.<br />By continuing, you agree to our Terms & Privacy Policy.
      </span>
    </div>
  );
}
