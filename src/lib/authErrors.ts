/**
 * authErrors.ts
 *
 * Phone sign-in can fail in four different places — Firebase on the web, the Firebase Capacitor plugin on
 * Android, our firebase-phone-auth edge function, and the network in between — and each reports in its own
 * shape. The UI must never show any of them raw ("auth/too-many-requests", "Edge Function returned a non-2xx
 * status code"), so everything is reduced here to one i18n key.
 */

/** An error whose user-facing text is already decided. Thrown by authService for edge-function outcomes. */
export class OtpError extends Error {
  constructor(
    readonly key: string,
    readonly params?: Record<string, string | number>,
    options?: { cause?: unknown },
  ) {
    super(key);
    this.name = "OtpError";
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

/** Resolve any thrown value to display text via the app's translators. Never returns provider text. */
export function otpErrorText(
  err: unknown,
  t: (key: string) => string,
  tf: (key: string, params: Record<string, string | number>) => string,
): string {
  const key = otpErrorKey(err);
  const params = err instanceof OtpError ? err.params : undefined;
  return params ? tf(key, params) : t(key);
}

const BY_CODE: Record<string, string> = {
  // Firebase Auth (web SDK and native plugin share these)
  "auth/invalid-verification-code": "otp_err_invalid_code",
  "auth/invalid-verification-id": "otp_err_session_lost",
  "auth/missing-verification-code": "otp_err_invalid_code",
  "auth/code-expired": "otp_err_expired",
  "auth/session-expired": "otp_err_expired",
  "auth/too-many-requests": "otp_err_too_many",
  "auth/quota-exceeded": "otp_err_too_many",
  "auth/invalid-phone-number": "otp_err_invalid_phone",
  "auth/missing-phone-number": "otp_err_invalid_phone",
  "auth/captcha-check-failed": "otp_err_captcha",
  "auth/missing-app-credential": "otp_err_captcha",
  "auth/invalid-app-credential": "otp_err_captcha",
  "auth/network-request-failed": "otp_err_network",
  "auth/web-storage-unsupported": "otp_err_generic",
  // firebase-phone-auth edge function
  rate_limited: "otp_err_too_many",
  invalid_token: "otp_err_expired",
  stale_token: "otp_err_expired",
  no_auth_time: "otp_err_expired",
  unsupported_number: "otp_err_unsupported_number",
  in_progress: "otp_err_in_progress",
};

/** Matches the plugin's free-text messages when it gives no code. */
const BY_MESSAGE: Array<[RegExp, string]> = [
  [/invalid[- ]verification[- ]code|incorrect.*code|wrong.*code/i, "otp_err_invalid_code"],
  [/expired/i, "otp_err_expired"],
  [/too[- ]many|blocked all requests|quota/i, "otp_err_too_many"],
  [/invalid.*phone|phone.*invalid/i, "otp_err_invalid_phone"],
  [/captcha|recaptcha|play integrity|safetynet|app check/i, "otp_err_captcha"],
  [/network|offline|failed to fetch|timeout/i, "otp_err_network"],
  [/no (native )?verification request|verification (id|request)/i, "otp_err_session_lost"],
];

/**
 * A short label for what the provider actually reported, for the failure *event* only (never shown to a person). The
 * screen deliberately says one friendly thing for a dozen different failures — which is right for the user and useless for
 * finding out why sign-in is failing. "Couldn't complete the security check" alone cannot tell a misregistered Android key
 * from a blocked reCAPTCHA from a restricted API key; this can. It is a code or a fixed category, never free text, so it
 * carries nothing personal.
 */
export function providerErrorLabel(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  if (typeof e?.code === "string" && /^[a-z0-9_.:/-]{3,64}$/i.test(e.code)) return e.code.toLowerCase();
  const m = typeof e?.message === "string" ? e.message.toLowerCase() : "";
  const hints: Array<[RegExp, string]> = [
    [/not authorized to use firebase|package name|sha-?1|sha-?256/, "app-not-authorized"],
    [/play integrity|integrity/, "play-integrity"],
    [/safetynet/, "safetynet"],
    [/recaptcha/, "recaptcha"],
    [/api key|api_key|referer|referrer|requests from this/, "api-key-restricted"],
    [/region/, "sms-region"],
    [/too[- ]many|blocked all requests/, "too-many"],
    [/network|offline|failed to fetch|timeout/, "network"],
  ];
  for (const [re, label] of hints) if (re.test(m)) return label;
  return "unknown";
}

/** Reduce any thrown value to an i18n key. Never returns raw provider text. */
export function otpErrorKey(err: unknown): string {
  if (err instanceof OtpError) return err.key;
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  if (typeof e?.code === "string" && BY_CODE[e.code]) return BY_CODE[e.code];
  if (typeof e?.message === "string") {
    for (const [re, key] of BY_MESSAGE) if (re.test(e.message)) return key;
  }
  return "otp_err_generic";
}

/** True for outcomes where retrying the same code cannot succeed, so the screen should demand a fresh one. */
export function needsNewCode(key: string): boolean {
  return key === "otp_err_expired" || key === "otp_err_session_lost" || key === "otp_err_too_many";
}
