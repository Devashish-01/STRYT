import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authService } from "@/services";
import { config } from "@/config";
import { useI18n } from "@/lib/i18n";
import { otpErrorKey, otpErrorText, needsNewCode } from "@/lib/authErrors";
import { cooldownRemaining, OTP_COOLDOWN_SEC } from "@/lib/otpThrottle";
import { formatPhone, normalizePhone } from "@/lib/phone";
import {
  isNativePlatform,
  nativeHasPendingVerification,
  nativeWasAutoVerified,
  onNativeAutoVerified,
  hasPendingPhoneVerification,
} from "@/lib/nativeAuth";
import { useApp } from "@/store";
import { returnTo } from "@/lib/returnTo";
import { ArrowLeft, Loader } from "@/components/Icons";
import AppMark from "@/components/AppMark";

export default function OtpVerify() {
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { phone?: string; autoVerified?: boolean } };
  // state?.phone is lost when the browser reloads the tab (common on mobile when
  // the user switches to the SMS app to read the code). Fall back to sessionStorage.
  const phone = state?.phone ?? sessionStorage.getItem("otp_phone") ?? "";

  const { t, tf } = useI18n();
  const { signIn, showToast } = useApp();
  const e164 = normalizePhone(phone);

  // The web ConfirmationResult lives in memory, so a reload mid-flow (common when the user flips to the SMS app)
  // leaves a code screen that can never verify. Send them back to request a fresh code instead of stranding them.
  // `?preview` (dev builds only, compiled out of production) lets design/e2e tooling open this screen without sending an SMS.
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
  const verificationLost =
    !preview && !state?.autoVerified && !(isNativePlatform() ? nativeHasPendingVerification() : hasPendingPhoneVerification());

  useEffect(() => {
    if (!phone) { nav("/auth/phone", { replace: true }); return; }
    if (verificationLost) {
      showToast(t("otp_err_session_lost"));
      nav("/auth/phone", { replace: true });
    }
    // Runs once per mount: the decision is about how this screen was entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const MAX_WRONG_CODES = 5;
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  // Seed from the persisted send time so a reload cannot reset the resend timer into a free extra SMS.
  const [seconds, setSeconds] = useState(() => cooldownRemaining(e164));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [wrongCodes, setWrongCodes] = useState(0);
  const [needFresh, setNeedFresh] = useState(false);
  const [error, setError] = useState("");
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const inFlight = useRef(false);
  const lastSubmitted = useRef("");

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const code = digits.join("");
  const filled = code.length === 6;

  function set(i: number, v: string) {
    setError("");
    const clean = v.replace(/\D/g, "");
    // Paste of full code into any box — fill all from position 0
    if (clean.length > 1) {
      const next = Array.from({ length: 6 }, (_, k) => clean[k] ?? "");
      setDigits(next);
      refs.current[Math.min(clean.length, 5)]?.focus();
      return;
    }
    const val = clean.slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
    if (val && i < digits.length - 1) refs.current[i + 1]?.focus();
  }

  async function finishSignIn() {
    sessionStorage.removeItem("otp_phone");
    signIn();
    // Return to the page the user originally tried to open (a shared deep link),
    // or /home. The Protected guard still routes brand-new users to
    // /auth/onboard based on real profile data — location is beat 3 of that
    // flow now, rather than a separate screen afterwards.
    nav(returnTo.consume(), { replace: true });
  }

  /** `typed === null` means Android already verified the number without a code. */
  async function verify(typed: string | null = code) {
    if (inFlight.current) return;
    inFlight.current = true;
    setVerifying(true);
    try {
      await authService.verifyOtp(phone, typed);
      await finishSignIn();
    } catch (e) {
      const key = otpErrorKey(e);
      setError(otpErrorText(e, t, tf));
      if (typed !== null) {
        setDigits(["", "", "", "", "", ""]);
        lastSubmitted.current = "";
        refs.current[0]?.focus();
      }
      if (key === "otp_err_invalid_code") {
        const n = wrongCodes + 1;
        setWrongCodes(n);
        if (n >= MAX_WRONG_CODES) { setNeedFresh(true); setError(t("otp_err_wrong_codes")); }
      } else if (needsNewCode(key)) {
        setNeedFresh(true);
      }
    } finally {
      inFlight.current = false;
      setVerifying(false);
    }
  }

  // Auto-submit on the sixth digit (the button stays as a fallback). `lastSubmitted` stops the same code
  // from firing twice if the component re-renders while a request is in flight.
  useEffect(() => {
    if (filled && !needFresh && lastSubmitted.current !== code) {
      lastSubmitted.current = code;
      void verify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, needFresh]);

  // Android instant verification / SMS auto-read: no code to type, finish straight away.
  useEffect(() => {
    if (!isNativePlatform()) return;
    if (state?.autoVerified || nativeWasAutoVerified()) void verify(null);
    return onNativeAutoVerified(() => { void verify(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resend() {
    if (resending) return;
    setResending(true);
    try {
      const { autoVerified } = await authService.sendOtp(phone, { resend: true });
      setSeconds(OTP_COOLDOWN_SEC);
      setNeedFresh(false);
      setWrongCodes(0);
      setError("");
      setDigits(["", "", "", "", "", ""]);
      lastSubmitted.current = "";
      refs.current[0]?.focus();
      showToast(t("otp_sent_again"));
      if (autoVerified) void verify(null);
    } catch (e) {
      showToast(otpErrorText(e, t, tf));
    } finally {
      setResending(false);
    }
  }

  const mm = `0:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="screen otp-screen">
      <header className="otp-top">
        <button type="button" className="otp-back" onClick={() => nav(-1)} aria-label={t("back_word")}>
          <ArrowLeft size={22} />
        </button>
      </header>

      <main className="otp-main">
        <AppMark size={56} radius={16} shadow={false} />
        <h1 className="otp-title">{t("otp_title")}</h1>
        <p className="otp-sub">
          {tf("otp_sub", { phone: formatPhone(phone) })}{" "}
          <button type="button" className="otp-link" onClick={() => nav("/auth/phone", { replace: true })}>
            {t("otp_change")}
          </button>
        </p>

        <div className={`otp-boxes${error ? " has-error" : ""}`} role="group" aria-label={t("otp_title")}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className={`otp-box${d ? " filled" : ""}`}
              inputMode="numeric"
              maxLength={6}
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={tf("otp_digit", { n: i + 1 })}
              aria-invalid={Boolean(error)}
              value={d}
              disabled={verifying}
              autoFocus={i === 0}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
            />
          ))}
        </div>

        <div className="otp-status" aria-live="polite">
          {error && <div className="otp-error" role="alert">{error}</div>}
          {seconds > 0 ? (
            <span className="otp-muted">{tf("otp_resend_in", { time: mm })}</span>
          ) : (
            <span className="otp-muted">
              {t("otp_didnt_get")}{" "}
              <button type="button" className="otp-link" onClick={resend} disabled={resending}>
                {resending ? t("otp_sending") : t("otp_resend")}
              </button>
            </span>
          )}
        </div>

        <button
          type="button"
          className="login-cta otp-cta"
          disabled={!filled || verifying || needFresh}
          onClick={() => void verify(code)}
        >
          {verifying ? <Loader className="spin" size={20} /> : t("otp_verify")}
        </button>
      </main>

      {/* Invisible reCAPTCHA container for Firebase resend */}
      <div id="recaptcha-container"></div>
    </div>
  );
}
