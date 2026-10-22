import { describe, expect, it } from "vitest";
import {
  INDIAN_MOBILE,
  MAX_TOKEN_AGE_SEC,
  checkFirebaseClaims,
  clientIp,
  hashKey,
} from "../supabase/functions/firebase-phone-auth/lib";
import { MAX_PASSWORD_LEN, derivedPassword } from "../supabase/functions/firebase-phone-auth/lib";

const NOW = 1_800_000_000;
const good = {
  sub: "fb-uid-1",
  phone_number: "+919876543210",
  auth_time: NOW - 10,
  firebase: { sign_in_provider: "phone" },
};

describe("checkFirebaseClaims", () => {
  it("accepts a fresh phone token for an Indian mobile", () => {
    expect(checkFirebaseClaims(good, NOW)).toEqual({ ok: true, phone: "+919876543210", firebaseUid: "fb-uid-1" });
  });

  it("rejects tokens that did not come from phone sign-in (a Google token must not mint a phone session)", () => {
    for (const provider of ["google.com", "anonymous", "password", undefined]) {
      const r = checkFirebaseClaims({ ...good, firebase: { sign_in_provider: provider } }, NOW);
      expect(r).toMatchObject({ ok: false, code: "wrong_provider", status: 401 });
    }
  });

  it("rejects a token whose OTP was entered more than 5 minutes ago (replay)", () => {
    const r = checkFirebaseClaims({ ...good, auth_time: NOW - MAX_TOKEN_AGE_SEC - 1 }, NOW);
    expect(r).toMatchObject({ ok: false, code: "stale_token" });
  });

  it("accepts a token exactly at the age limit and small clock skew into the future", () => {
    expect(checkFirebaseClaims({ ...good, auth_time: NOW - MAX_TOKEN_AGE_SEC }, NOW).ok).toBe(true);
    expect(checkFirebaseClaims({ ...good, auth_time: NOW + 30 }, NOW).ok).toBe(true);
  });

  it("rejects an auth_time far in the future", () => {
    expect(checkFirebaseClaims({ ...good, auth_time: NOW + 3600 }, NOW)).toMatchObject({ ok: false, code: "stale_token" });
  });

  it("rejects a missing or non-numeric auth_time", () => {
    expect(checkFirebaseClaims({ ...good, auth_time: undefined }, NOW)).toMatchObject({ ok: false, code: "no_auth_time" });
    expect(checkFirebaseClaims({ ...good, auth_time: "now" as unknown as number }, NOW)).toMatchObject({ ok: false, code: "no_auth_time" });
  });

  it("rejects a token with no phone number", () => {
    expect(checkFirebaseClaims({ ...good, phone_number: undefined }, NOW)).toMatchObject({ ok: false, code: "no_phone", status: 400 });
  });

  it("rejects non-Indian and malformed numbers", () => {
    for (const phone of ["+14155550123", "+915876543210", "+91987654321", "+9198765432100", "9876543210", "+91 98765 43210"]) {
      expect(checkFirebaseClaims({ ...good, phone_number: phone }, NOW)).toMatchObject({ ok: false, code: "unsupported_number" });
    }
  });

  it("falls back to user_id when sub is absent, and rejects when both are", () => {
    expect(checkFirebaseClaims({ ...good, sub: undefined, user_id: "legacy-uid" }, NOW)).toMatchObject({ ok: true, firebaseUid: "legacy-uid" });
    expect(checkFirebaseClaims({ ...good, sub: undefined }, NOW)).toMatchObject({ ok: false, code: "no_subject" });
  });
});

describe("INDIAN_MOBILE", () => {
  it("matches the regex the onboarding RPC enforces (20260997)", () => {
    expect(INDIAN_MOBILE.test("+916000000000")).toBe(true);
    expect(INDIAN_MOBILE.test("+919999999999")).toBe(true);
    expect(INDIAN_MOBILE.test("+915999999999")).toBe(false);
  });
});

describe("clientIp", () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });
  it("uses the first x-forwarded-for hop", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });
  it("falls back to cf-connecting-ip, then a shared bucket", () => {
    expect(clientIp(h({ "cf-connecting-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(h({}))).toBe("unknown");
  });
});

describe("hashKey", () => {
  it("is stable, short, and does not contain the input", async () => {
    const a = await hashKey("+919876543210");
    expect(a).toBe(await hashKey("+919876543210"));
    expect(a).toHaveLength(16);
    expect(a).not.toContain("9876543210");
    expect(a).not.toBe(await hashKey("+919876543211"));
  });
});

describe("derivedPassword — the account's fixed sign-in password", () => {
  it("is the same every time for the same account and key, so logging in never has to change a password", async () => {
    expect(await derivedPassword("key-1", "user-a")).toBe(await derivedPassword("key-1", "user-a"));
  });

  it("differs per account and per key", async () => {
    const a = await derivedPassword("key-1", "user-a");
    expect(await derivedPassword("key-1", "user-b")).not.toBe(a);
    expect(await derivedPassword("key-2", "user-a")).not.toBe(a);
  });

  it("is under GoTrue's 72-character limit and long enough to be unguessable", async () => {
    const pw = await derivedPassword("a-service-key", "6c9178e4-1887-40f1-b5ea-75904b45a4f3");
    expect(pw).toMatch(/^p_[0-9a-f]{64}$/);
    expect(pw.length).toBeLessThanOrEqual(MAX_PASSWORD_LEN);
  });

  it("is never the user id or the key itself", async () => {
    const pw = await derivedPassword("secret-key", "user-a");
    expect(pw).not.toContain("secret-key");
    expect(pw).not.toContain("user-a");
  });
});
