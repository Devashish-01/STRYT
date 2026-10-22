/**
 * otpThrottle.ts
 *
 * Client-side send throttle for phone OTP. It is NOT a security control — a script can ignore it, and the real
 * limits are Firebase's quota/region policy and the edge function's rate limit. What it does is stop an honest
 * user from burning SMS (which Firebase Blaze bills per message) by reloading the page, since the on-screen
 * resend timer resets on a reload. State lives in sessionStorage so it survives a reload but not a new session.
 */

export const OTP_COOLDOWN_SEC = 55;
export const OTP_MAX_SENDS = 5;

const KEY = "otp_throttle_v1";

interface Entry { last: number; sends: number }
type Store = Pick<Storage, "getItem" | "setItem">;

function read(store: Store | undefined, phone: string): Entry | null {
  try {
    const all = JSON.parse(store?.getItem(KEY) ?? "{}") as Record<string, Entry>;
    const e = all[phone];
    return e && typeof e.last === "number" && typeof e.sends === "number" ? e : null;
  } catch {
    return null;
  }
}

function write(store: Store | undefined, phone: string, entry: Entry): void {
  try {
    const all = JSON.parse(store?.getItem(KEY) ?? "{}") as Record<string, Entry>;
    all[phone] = entry;
    store?.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the throttle degrades to "off", never to "locked out".
  }
}

const defaultStore = (): Store | undefined => {
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : undefined; } catch { return undefined; }
};

export type SendDecision =
  | { ok: true }
  | { ok: false; reason: "cooldown"; seconds: number }
  | { ok: false; reason: "limit" };

export function canSendOtp(phone: string, now = Date.now(), store: Store | undefined = defaultStore()): SendDecision {
  const e = read(store, phone);
  if (!e) return { ok: true };
  if (e.sends >= OTP_MAX_SENDS) return { ok: false, reason: "limit" };
  const waited = Math.floor((now - e.last) / 1000);
  if (waited < OTP_COOLDOWN_SEC) return { ok: false, reason: "cooldown", seconds: OTP_COOLDOWN_SEC - waited };
  return { ok: true };
}

export function recordOtpSent(phone: string, now = Date.now(), store: Store | undefined = defaultStore()): void {
  const e = read(store, phone);
  write(store, phone, { last: now, sends: (e?.sends ?? 0) + 1 });
}

/** Seconds left on the cooldown for this number (0 when a send is allowed), to seed the resend timer. */
export function cooldownRemaining(phone: string, now = Date.now(), store: Store | undefined = defaultStore()): number {
  const d = canSendOtp(phone, now, store);
  return !d.ok && d.reason === "cooldown" ? d.seconds : 0;
}
