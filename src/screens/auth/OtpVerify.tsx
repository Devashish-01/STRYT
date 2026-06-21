import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { authService } from "@/services";
import { config } from "@/config";
import { useApp } from "@/store";
import { returnTo } from "@/lib/returnTo";

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
    <div className="screen">
      <AppBar />
      <div className="screen-scroll page-pad">
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>Enter the code</h1>
        <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
          Sent to <span className="semi" style={{ color: "var(--ink-900)" }}>{isEmail ? phone : `+91 ${phone}`}</span>.{" "}
          <button className="semi" style={{ color: "var(--brand-700)" }} onClick={() => nav(-1)}>Change</button>
        </p>

        <div className="row gap-8" style={{ marginTop: 32, justifyContent: "center" }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="input"
              style={{
                width: 46,
                height: 58,
                textAlign: "center",
                fontSize: 24,
                fontWeight: 800,
                padding: 0,
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

        <div className="row center" style={{ marginTop: 22 }}>
          {seconds > 0 ? (
            <span className="muted small">Resend code in 0:{seconds.toString().padStart(2, "0")}</span>
          ) : (
            <button className="semi small" style={{ color: "var(--brand-700)", opacity: resending ? 0.5 : 1 }} onClick={resend} disabled={resending}>
              {resending ? "Sending…" : "Resend code"}
            </button>
          )}
        </div>

        {config.useMocks && (
          <div
            className="card"
            style={{ marginTop: 24, padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}
          >
            <p className="tiny" style={{ color: "var(--brand-700)", textAlign: "center" }}>
              💡 Dev build: use a Supabase test number and its fixed code
            </p>
          </div>
        )}
      </div>

      <div className="page-pad">
        <button className="btn btn-primary btn-block" disabled={!filled || verifying} onClick={verify}>
          {verifying ? "Verifying…" : "Verify & continue"}
        </button>
      </div>
    </div>
  );
}
