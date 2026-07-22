// Central legal-version + document links for the Terms/Privacy acceptance gate.
//
// LEGAL_VERSION drives the clickwrap gate in App.tsx: a signed-in user must have
// accepted THIS exact version, otherwise they are sent to /auth/terms. Bump this
// whenever you publish a material update to the Terms & Conditions or Privacy
// Policy — every user is then automatically re-prompted to accept the new
// version on their next visit. Keep the string short (<= 40 chars; it is stored
// in users.terms_accepted_version and terms_acceptances.version).
//
// Convention: use the publication date of the updated documents, e.g. bump to
// "2026-09-01" when you next revise them.
export const LEGAL_VERSION = "2026-07-19";

const env = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;

// Canonical external URLs, if/when the documents are also published on the
// marketing site. The in-app screens link to LEGAL_ROUTES below instead, so no
// external hosting is required for the acceptance flow to work. Override the
// external URLs per-environment via VITE_TERMS_URL / VITE_PRIVACY_URL.
export const LEGAL_TERMS_URL: string =
  env.VITE_TERMS_URL || "https://stryt.in/legal/terms-and-conditions";
export const LEGAL_PRIVACY_URL: string =
  env.VITE_PRIVACY_URL || "https://stryt.in/legal/privacy-policy";

// In-app routes that render the bundled policy documents (see lib/legalDocs.ts
// and screens/legal/). The app UI links here so the documents open identically
// on the web and inside the native app, with nothing extra to host. The slug
// segments must match the .md filenames in /legal.
export const LEGAL_ROUTES = {
  index: "/legal",
  terms: "/legal/terms-and-conditions",
  privacy: "/legal/privacy-policy",
} as const;
