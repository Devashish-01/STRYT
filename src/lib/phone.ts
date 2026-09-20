// Phone numbers, India-first.
//
// Collected at onboarding and stored on the profile, but **not verified** — there is no OTP behind it,
// by decision: verifying every signup would mean an SMS per account (~₹0.30), keeping Supabase's phone
// auth provider switched on, and treating CAPTCHA and rate limiting as mandatory rather than pending
// work. The number is contact information, not proof of identity, and nothing in the app should treat
// it as proof.
//
// That also means: never show a "verified" tick next to it, and never use it as an authentication
// factor. If a feature later needs a number that is genuinely the user's, it has to verify it then.

/** Digits-only length of an Indian mobile number, without the country code. */
const IN_NATIONAL_LEN = 10;

/**
 * Best-effort E.164. Accepts what people actually type — "98765 43210", "+91 98765-43210",
 * "09876543210", "919876543210" — and returns "+919876543210".
 * Input it cannot make sense of is returned trimmed, so validation (not this) decides what is rejected.
 */
export function normalizePhone(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");

  // A single leading 0 is the Indian trunk prefix — "09876543210" is the same number as "9876543210".
  if (digits.length === IN_NATIONAL_LEN + 1 && digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length === IN_NATIONAL_LEN) return `+91${digits}`;
  if (digits.length === IN_NATIONAL_LEN + 2 && digits.startsWith("91")) return `+${digits}`;
  // Already international, or something we do not recognise — hand it back for validation to judge
  // rather than mangling it into a plausible-looking wrong number.
  return raw.startsWith("+") ? `+${digits}` : raw;
}

/**
 * True when the input normalises to a plausible Indian mobile number.
 *
 * Deliberately only a *format* check. It cannot tell you the number exists, is reachable, or belongs
 * to the person typing it — nothing here should be read as verification.
 *
 * Indian mobile numbers start with 6–9; landlines and service codes do not, and rejecting those early
 * is worth it because an unreachable number is worse than no number for a marketplace where the two
 * sides have to actually meet.
 */
export function isValidPhone(input: string): boolean {
  const e164 = normalizePhone(input);
  return /^\+91[6-9]\d{9}$/.test(e164);
}

/** "+919876543210" → "+91 98765 43210", for display only. Never store the formatted form. */
export function formatPhone(input: string): string {
  const e164 = normalizePhone(input);
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
