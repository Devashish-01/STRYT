/**
 * Firebase "test phone numbers" (Authentication → Sign-in method → Phone → Phone numbers for testing) are fixed number/code
 * pairs that never send an SMS. On a web page they still go through reCAPTCHA, and from `localhost` Google's reCAPTCHA
 * token is rejected (`auth/invalid-app-credential`), so a developer cannot sign in with one through the real login screen.
 * Firebase's own answer is `auth.settings.appVerificationDisabledForTesting`, which skips the check for registered test
 * numbers only.
 *
 * It is switched on here ONLY in a development build (`import.meta.env.DEV`, which is false in every production bundle) and
 * ONLY for the numbers listed in VITE_FIREBASE_TEST_PHONES. A real person's number never matches, so nothing changes for them.
 */
export function parseTestPhones(raw: string | undefined | null): string[] {
  return (raw ?? "").split(",").map((p) => p.trim()).filter((p) => /^\+\d{8,15}$/.test(p));
}

export function skipAppVerificationFor(phone: string, opts: { dev: boolean; testPhones: string | undefined | null }): boolean {
  if (!opts.dev) return false;
  return parseTestPhones(opts.testPhones).includes(phone.trim());
}
