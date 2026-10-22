import { describe, expect, it } from "vitest";
import { OtpError, needsNewCode, otpErrorKey, otpErrorText } from "../src/lib/authErrors";
import { OTP_COOLDOWN_SEC, OTP_MAX_SENDS, canSendOtp, cooldownRemaining, recordOtpSent } from "../src/lib/otpThrottle";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("otpErrorKey", () => {
  it("maps Firebase codes", () => {
    expect(otpErrorKey({ code: "auth/invalid-verification-code" })).toBe("otp_err_invalid_code");
    expect(otpErrorKey({ code: "auth/code-expired" })).toBe("otp_err_expired");
    expect(otpErrorKey({ code: "auth/too-many-requests" })).toBe("otp_err_too_many");
    expect(otpErrorKey({ code: "auth/network-request-failed" })).toBe("otp_err_network");
    expect(otpErrorKey({ code: "auth/captcha-check-failed" })).toBe("otp_err_captcha");
  });

  it("maps edge-function codes", () => {
    expect(otpErrorKey({ code: "rate_limited" })).toBe("otp_err_too_many");
    expect(otpErrorKey({ code: "stale_token" })).toBe("otp_err_expired");
    expect(otpErrorKey({ code: "unsupported_number" })).toBe("otp_err_unsupported_number");
    expect(otpErrorKey({ code: "in_progress" })).toBe("otp_err_in_progress");
  });

  it("falls back to the plugin's free-text messages", () => {
    expect(otpErrorKey(new Error("The SMS verification code used is invalid"))).toBe("otp_err_generic"); // no safe regex hit
    expect(otpErrorKey(new Error("Invalid verification code"))).toBe("otp_err_invalid_code");
    expect(otpErrorKey(new Error("A network error (such as timeout)"))).toBe("otp_err_network");
    expect(otpErrorKey(new Error("No native verification request found."))).toBe("otp_err_session_lost");
  });

  it("never leaks raw provider text", () => {
    const t = (k: string) => `T:${k}`;
    const tf = (k: string, p: Record<string, string | number>) => `TF:${k}:${p.n}`;
    expect(otpErrorText(new Error("Edge Function returned a non-2xx status code"), t, tf)).toBe("T:otp_err_generic");
    expect(otpErrorText({ code: "auth/internal-error", message: "INTERNAL ASSERTION FAILED" }, t, tf)).toBe("T:otp_err_generic");
  });

  it("passes OtpError keys and params through", () => {
    const t = (k: string) => `T:${k}`;
    const tf = (k: string, p: Record<string, string | number>) => `TF:${k}:${p.n}`;
    expect(otpErrorText(new OtpError("otp_cooldown_wait", { n: 12 }), t, tf)).toBe("TF:otp_cooldown_wait:12");
    expect(otpErrorText(new OtpError("otp_send_limit"), t, tf)).toBe("T:otp_send_limit");
  });

  it("flags outcomes that need a fresh code", () => {
    expect(needsNewCode("otp_err_expired")).toBe(true);
    expect(needsNewCode("otp_err_session_lost")).toBe(true);
    expect(needsNewCode("otp_err_invalid_code")).toBe(false);
  });
});

describe("otpThrottle", () => {
  const phone = "+919876543210";

  it("allows the first send, then enforces the cooldown", () => {
    const s = memStore();
    expect(canSendOtp(phone, 0, s).ok).toBe(true);
    recordOtpSent(phone, 0, s);
    expect(canSendOtp(phone, 10_000, s)).toEqual({ ok: false, reason: "cooldown", seconds: OTP_COOLDOWN_SEC - 10 });
    expect(canSendOtp(phone, OTP_COOLDOWN_SEC * 1000, s).ok).toBe(true);
  });

  it("caps sends per number, per session", () => {
    const s = memStore();
    let now = 0;
    for (let i = 0; i < OTP_MAX_SENDS; i++) {
      expect(canSendOtp(phone, now, s).ok).toBe(true);
      recordOtpSent(phone, now, s);
      now += (OTP_COOLDOWN_SEC + 1) * 1000;
    }
    expect(canSendOtp(phone, now, s)).toEqual({ ok: false, reason: "limit" });
  });

  it("tracks numbers independently", () => {
    const s = memStore();
    recordOtpSent(phone, 0, s);
    expect(canSendOtp("+919000000001", 1000, s).ok).toBe(true);
  });

  it("reports remaining cooldown for the resend timer, 0 when free", () => {
    const s = memStore();
    expect(cooldownRemaining(phone, 0, s)).toBe(0);
    recordOtpSent(phone, 0, s);
    expect(cooldownRemaining(phone, 5_000, s)).toBe(OTP_COOLDOWN_SEC - 5);
  });

  it("degrades to 'allowed' when storage is unavailable or corrupt", () => {
    expect(canSendOtp(phone, 0, undefined).ok).toBe(true);
    const bad = { getItem: () => "{not json", setItem: () => { throw new Error("blocked"); } };
    expect(canSendOtp(phone, 0, bad).ok).toBe(true);
    expect(() => recordOtpSent(phone, 0, bad)).not.toThrow();
  });
});
