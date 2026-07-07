import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authService } from "@/services";
import { config } from "@/config";
import { useApp } from "@/store";
import { returnTo } from "@/lib/returnTo";
import { ArrowLeft, Loader } from "@/components/Icons";

export default function OtpVerify() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { phone?: string } };
  // state?.phone is lost when the browser reloads the tab (common on mobile when
  // the user switches to the SMS app to read the code). Fall back to sessionStorage.
  const phone = state?.phone ?? sessionStorage.getItem("otp_phone") ?? "";

  useEffect(() => {
    if (!phone) nav("/auth/phone", { replace: true });
  }, [phone, nav]);
  const { signIn, showToast } = useApp();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [seconds, setSeconds] = useState(55);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const code = digits.join("");
  const filled = code.length === 6;

  function set(i: number, v: string) {
    const clean = v.replace(/\D/g, "");
    // Paste of full code into any box — fill all from position 0
    if (clean.length > 1) {
      const next = Array.from({ length: 6 }, (_, k) => clean[k] ?? "");
      setDigits(next);
      refs.current[Math.min(clean.length, 5)]?.focus();
      return;
    }
    const val = clean.slice(-1);
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < digits.length - 1) refs.current[i + 1]?.focus();
  }

  async function verify() {
    setVerifying(true);
    try {
      await authService.verifyOtp(phone, code);
      sessionStorage.removeItem("otp_phone");
      signIn();
      // Return to the page the user originally tried to open (a shared deep link),
      // or /home. The Protected guard still routes brand-new users with no
      // location to /auth/location based on real profile data.
      nav(returnTo.consume(), { replace: true });
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't verify. Try again.";
      showToast(msg);
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    try {
      if (phone.includes("@")) {
        await authService.sendEmailOtp(phone);
      } else {
        await authService.sendOtp(phone);
      }
      setSeconds(55);
      showToast("Code sent again");
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't resend. Try again.";
      showToast(msg);
    } finally {
      setResending(false);
    }
  }

  const isEmail = phone.includes("@");

  return (
    <div
      className="screen"
      style={{
        background: "linear-gradient(160deg, var(--brand-50) 0%, var(--brand-100) 60%, var(--brand-200) 100%)",
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
          onClick={() => nav(-1)}
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

      {/* Hero / Info Section */}
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
            <path d="M32 41 C24 35 40 24 32 17" stroke="var(--accent-400)" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeDasharray="0.5 3.8" />
          </svg>
        </div>
        <h1 className="h1" style={{ letterSpacing: -0.5, color: "var(--ink-900)" }}>Verification Code</h1>
        <p style={{ fontSize: 14, color: "var(--ink-600)", marginTop: 6, maxWidth: 280, lineHeight: 1.4 }}>
          Sent to <span className="semi" style={{ color: "var(--brand-700)" }}>{isEmail ? phone : `+91 ${phone}`}</span>
        </p>
      </div>

      {/* Card containing Digits Input */}
      <div
        style={{
          zIndex: 10,
          background: "#fff",
          border: "1px solid var(--ink-200)",
          borderRadius: 28,
          padding: "32px 20px",
          width: "100%",
          boxShadow: "var(--shadow-lg)",
          marginTop: 24,
        }}
      >
        <div className="row gap-8" style={{ justifyContent: "center" }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="input"
              style={{
                width: 44,
                height: 56,
                textAlign: "center",
                fontSize: 22,
                fontWeight: 800,
                padding: 0,
                background: "var(--ink-50)",
                border: "1.5px solid var(--ink-200)",
                borderRadius: 12,
                color: "var(--ink-900)",
                outline: "none",
              }}
              inputMode="numeric"
              maxLength={6}
              autoComplete={i === 0 ? "one-time-code" : "off"}
              value={d}
              autoFocus={i === 0}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
            />
          ))}
        </div>

        {/* Resend & Timer */}
        <div className="row center" style={{ marginTop: 24 }}>
          {seconds > 0 ? (
            <span className="muted small" style={{ color: "var(--ink-500)" }}>
              Resend code in 0:{seconds.toString().padStart(2, "0")}
            </span>
          ) : (
            <button
              style={{
                background: "none",
                border: "none",
                color: "var(--brand-700)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
              onClick={resend}
              disabled={resending}
            >
              {resending ? "Sending..." : "Resend code"}
            </button>
          )}
        </div>
      </div>

      {/* Verify Button */}
      <div className="col gap-12" style={{ width: "100%", zIndex: 10 }}>
        <button
          className="btn btn-primary btn-block row center gap-8"
          disabled={!filled || verifying}
          onClick={verify}
          style={{ padding: 15, borderRadius: 16, fontWeight: 700, fontSize: 15 }}
        >
          {verifying ? <Loader className="spin" size={18} /> : "Verify & continue"}
        </button>
      </div>
    </div>
  );
}
