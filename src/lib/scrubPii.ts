/**
 * Removes personal data from anything on its way to an error sink.
 *
 * Error reports are the one place where personal data leaks by accident rather than by design: nobody writes
 * `throw new Error(user.phone)`, but `throw new Error(\`Failed to book for \${name} at \${lat},\${lng}\`)` is
 * ordinary code, and a fetch failure carries the whole URL including its query string. `src/lib/monitoring.ts`
 * says it sends "no PII beyond the error text/stack" — that was an intention, not a mechanism. This is the
 * mechanism.
 *
 * Applied to the existing `client_errors` sink today, and it is the `beforeSend` for Sentry once a DSN exists
 * (P14 §14.A.3).
 *
 * Deliberately blunt. A false positive costs a redacted token in a stack trace, which is an annoyance; a false
 * negative puts a customer's phone number in a third-party service, which is a breach. When the two are in
 * tension this errs towards redacting.
 */

/** What was found, so a report can say "3 things were redacted" without saying what they were. */
export interface ScrubResult<T> {
  value: T;
  redactions: number;
}

// ── Patterns ────────────────────────────────────────────────────────────────
// Ordered: the most specific first, so a phone inside a URL is caught as a phone, not half-matched by the
// coordinate rule.

const PATTERNS: { name: string; re: RegExp; to: string }[] = [
  // JWTs and Supabase keys — three base64url segments. Before the generic token rule so the shape is kept.
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, to: "[jwt]" },

  // Email. Deliberately ahead of the phone rule: an address can contain digits.
  { name: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, to: "[email]" },

  // Indian mobile numbers, the way people actually type them: +91 98765 43210, 09876543210, 98765-43210.
  // The leading boundary avoids eating the tail of a longer id.
  { name: "phone_in", re: /(?<![\d])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d])/g, to: "[phone]" },

  // International shapes we would otherwise miss: +1 415 555 0123, +44 20 7946 0958.
  { name: "phone_intl", re: /(?<![\d])\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}(?![\d])/g, to: "[phone]" },

  // Aadhaar: 12 digits, usually spaced 4-4-4.
  { name: "aadhaar", re: /(?<![\d])\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d])/g, to: "[gov-id]" },

  // PAN: five letters, four digits, one letter.
  { name: "pan", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, to: "[gov-id]" },

  // UPI handle: someone@oksbi, 9876543210@paytm. After the email rule, which has a stricter TLD.
  { name: "upi", re: /\b[A-Za-z0-9._-]{2,}@(?:ok[a-z]+|paytm|ybl|upi|axl|ibl|apl|sbi|hdfcbank|icici)\b/gi, to: "[upi]" },

  // Coordinate pairs: "18.5204,73.8567" or "lat=18.5204&lng=73.8567".
  { name: "coord_pair", re: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, to: "[coords]" },
  { name: "coord_kv", re: /\b(lat|lng|lon|latitude|longitude)\b(\s*[=:]\s*)(-?\d{1,3}\.\d+)/gi, to: "$1$2[coord]" },

  // Bearer tokens and api keys in headers or query strings.
  { name: "bearer", re: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, to: "$1 [token]" },
  { name: "key_kv", re: /\b(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|password|pwd|otp|handoff[_-]?code|tracking[_-]?token)\b(\s*[=:]\s*)(?:"|')?([^\s&"',}]{3,})/gi, to: "$1$2[redacted]" },

  // A bare 4-8 digit OTP or handoff code, but only when a word nearby says what it is — a bare "1234" is more
  // often an index or a price than a secret.
  { name: "otp_word", re: /\b(otp|code|pin)\b(\s*(?:is|=|:)?\s*)(\d{4,8})\b/gi, to: "$1$2[redacted]" },
];

/** Query parameters whose VALUE is always personal, whatever it looks like. */
const SENSITIVE_PARAMS = new Set([
  "phone", "email", "name", "alias", "address", "lat", "lng", "lon", "latitude", "longitude",
  "token", "access_token", "refresh_token", "apikey", "api_key", "otp", "code", "handoff_code",
  "password", "secret", "upi", "upi_id", "q", "query", "search",
]);

/** Object keys whose value is dropped wholesale, regardless of content. */
const SENSITIVE_KEYS =
  /^(phone|mobile|email|name|full_?name|display_?name|alias|address|address_?line\d?|delivery_address|delivery_address_line|lat|lng|lon|latitude|longitude|password|pwd|token|access_?token|refresh_?token|api_?key|apikey|secret|otp|pin|handoff_?code|tracking_?token|upi_?id|aadhaar[\w_]*|pan[\w_]*|verification_document_url|customer_name|customer_avatar|author_name|payer_name|requester_name|grantee_name)$/i;

// ── Core ────────────────────────────────────────────────────────────────────

/** Scrubs a string. Safe on any input; never throws. */
export function scrubString(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;
  let out = input;
  try {
    out = scrubUrlsIn(out);
    for (const { re, to } of PATTERNS) {
      out = out.replace(re, to);
    }
  } catch {
    // A pattern that somehow throws must not take the error report with it.
    return "[scrub-failed]";
  }
  return out;
}

/**
 * Rewrites any URL inside the text so sensitive query parameters lose their values. Done before the pattern
 * pass so `?phone=9876543210` is redacted by name even if the number shape were to change.
 */
function scrubUrlsIn(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>)]+/g, (url) => {
    try {
      const u = new URL(url);
      let touched = false;
      u.searchParams.forEach((_v, k) => {
        if (SENSITIVE_PARAMS.has(k.toLowerCase())) touched = true;
      });
      if (touched) {
        for (const k of Array.from(u.searchParams.keys())) {
          if (SENSITIVE_PARAMS.has(k.toLowerCase())) u.searchParams.set(k, "[redacted]");
        }
      }
      // Supabase REST filters put the value in the query: ?phone=eq.9876543210
      return u.toString();
    } catch {
      return url;
    }
  });
}

/**
 * Walks any value and scrubs it. Strings go through the pattern pass; an object key that names something
 * personal has its value dropped without inspecting it.
 *
 * Depth- and size-capped: an error payload is not worth a stack overflow, and a cyclic object must not hang
 * the failure path.
 */
export function scrubValue<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > 8) return "[depth-limit]" as unknown as T;
  if (value == null) return value;

  if (typeof value === "string") return scrubString(value) as unknown as T;
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]" as unknown as T;
    seen.add(value);
    return value.slice(0, 100).map((v) => scrubValue(v, depth + 1, seen)) as unknown as T;
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]" as unknown as T;
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : scrubValue(v, depth + 1, seen);
    }
    return out as unknown as T;
  }

  return value;
}

/** Scrubs the fields an error report is made of. */
export function scrubErrorReport(report: {
  message?: string;
  stack?: string;
  url?: string;
  breadcrumbs?: { t: number; msg: string }[];
  context?: Record<string, unknown>;
}): typeof report {
  return {
    ...report,
    message: report.message ? scrubString(report.message) : report.message,
    stack: report.stack ? scrubString(report.stack) : report.stack,
    url: report.url ? scrubString(report.url) : report.url,
    breadcrumbs: report.breadcrumbs?.map((b) => ({ t: b.t, msg: scrubString(b.msg) })),
    context: report.context ? scrubValue(report.context) : report.context,
  };
}
