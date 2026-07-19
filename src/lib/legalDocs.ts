// Bundles the /legal/*.md policy documents into the app so the Terms, Privacy
// Policy, and the other policies render in-app (screens/legal/) with no separate
// hosting. Content updates whenever the markdown is edited and the app rebuilt —
// bump LEGAL_VERSION in lib/legal.ts when you publish a material change so users
// are re-prompted to accept.
//
// import.meta.glob with ?raw + eager inlines each file's text at build time; the
// bytes land in the lazy-loaded legal screen chunk, not the main bundle.
const files = import.meta.glob("/legal/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface LegalDocMeta {
  slug: string;
  title: string;
}

// Friendly display titles, keyed by slug (= filename without .md).
const TITLES: Record<string, string> = {
  "terms-and-conditions": "Terms & Conditions",
  "privacy-policy": "Privacy Policy",
  "refund-cancellation-policy": "Refund & Cancellation Policy",
  "merchant-terms": "Merchant & Provider Terms",
  "acceptable-use-policy": "Acceptable Use Policy",
  "community-guidelines": "Community Guidelines",
  "cookie-policy": "Cookie Policy",
  "data-retention-policy": "Data Retention Policy",
  "grievance-redressal-policy": "Grievance Redressal Policy",
  "disclaimer": "Disclaimer",
  "TERMS_SUMMARY": "Terms — Plain-Language Summary",
};

// Display order for the index screen. README is intentionally excluded (it is an
// internal maintainer note, not a user-facing policy).
const ORDER = [
  "terms-and-conditions",
  "TERMS_SUMMARY",
  "privacy-policy",
  "cookie-policy",
  "refund-cancellation-policy",
  "merchant-terms",
  "acceptable-use-policy",
  "community-guidelines",
  "data-retention-policy",
  "grievance-redressal-policy",
  "disclaimer",
];

function slugOf(path: string): string {
  return path.replace(/^.*\/legal\//, "").replace(/\.md$/, "");
}

const bySlug = new Map<string, string>();
for (const [path, content] of Object.entries(files)) {
  bySlug.set(slugOf(path), content);
}

export function getLegalDoc(slug: string): { title: string; content: string } | null {
  const content = bySlug.get(slug);
  if (content == null) return null;
  return { title: TITLES[slug] ?? slug, content };
}

// Ordered, user-facing policy list for the index screen.
export const LEGAL_DOCS: LegalDocMeta[] = ORDER
  .filter((slug) => bySlug.has(slug))
  .map((slug) => ({ slug, title: TITLES[slug] ?? slug }));
