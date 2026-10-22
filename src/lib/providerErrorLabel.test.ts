import { describe, expect, it } from "vitest";
import { otpErrorKey, providerErrorLabel } from "./authErrors";

describe("providerErrorLabel — what the provider really said, for the failure event", () => {
  it("keeps Firebase's own code, so 'security check' failures can be told apart", () => {
    for (const code of ["auth/invalid-app-credential", "auth/captcha-check-failed", "auth/missing-app-credential", "auth/unauthorized-domain"]) {
      expect(providerErrorLabel({ code, message: "x" })).toBe(code);
    }
  });

  it("is what separates failures the screen words identically", () => {
    // all three show 'Couldn't complete the security check' …
    const a = { code: "auth/captcha-check-failed" };
    const b = { code: "auth/invalid-app-credential" };
    const c = { message: "This app is not authorized to use Firebase Authentication. Please verify that the correct package name, SHA-1, and SHA-256 are configured" };
    expect(new Set([otpErrorKey(a), otpErrorKey(b)])).toEqual(new Set(["otp_err_captcha"]));
    // … but the event says which one it was
    expect(new Set([providerErrorLabel(a), providerErrorLabel(b), providerErrorLabel(c)]).size).toBe(3);
  });

  it("recognises the Android plugin's free-text messages", () => {
    expect(providerErrorLabel({ message: "This app is not authorized to use Firebase Authentication. package name, SHA-1" })).toBe("app-not-authorized");
    expect(providerErrorLabel({ message: "Play Integrity token could not be obtained" })).toBe("play-integrity");
    expect(providerErrorLabel({ message: "SafetyNet attestation failed" })).toBe("safetynet");
    expect(providerErrorLabel({ message: "reCAPTCHA verification failed" })).toBe("recaptcha");
    expect(providerErrorLabel({ message: "Requests from this Android client application are blocked. API key restricted" })).toBe("api-key-restricted");
    expect(providerErrorLabel({ message: "SMS unable to be sent until this region enabled by the app developer" })).toBe("sms-region");
    expect(providerErrorLabel(new Error("Failed to fetch"))).toBe("network");
  });

  it("never passes free text or a phone number through", () => {
    const label = providerErrorLabel(new Error("Could not send to +91 79743 88188 right now"));
    expect(label).not.toMatch(/\d{5}/);
    expect(label).toBe("unknown");
    expect(providerErrorLabel({ code: "has spaces and +919999999999 in it" })).toBe("unknown");
    expect(providerErrorLabel(null)).toBe("unknown");
    expect(providerErrorLabel(undefined)).toBe("unknown");
  });
});
