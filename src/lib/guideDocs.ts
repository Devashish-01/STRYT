// Bundles the /guide/*.md user-guide & FAQ articles into the app, mirroring
// lib/legalDocs.ts exactly (import.meta.glob + ?raw + eager — content lands in
// the lazy-loaded guide screen chunk, not the main bundle). Content updates
// whenever an article is edited and the app rebuilt; no separate hosting or
// CMS needed, matching this codebase's only other long-form-content precedent.
//
// Unlike legalDocs.ts (which has a small, fixed, hand-curated document list),
// guide articles are numerous (30+) and role-scoped, so titles are read from
// each file's own leading "# Heading" line instead of a hand-maintained map —
// one less place for the title and the file to drift out of sync — and role is
// parsed from the filename prefix (customer-*.md / business-*.md / provider-*.md).
const files = import.meta.glob("/guide/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type GuideRole = "customer" | "business" | "provider";

export interface GuideDocMeta {
  slug: string;
  title: string;
  role: GuideRole;
}

export interface GuideDoc extends GuideDocMeta {
  content: string;
}

function slugOf(path: string): string {
  return path.replace(/^.*\/guide\//, "").replace(/\.md$/, "");
}

function roleOf(slug: string): GuideRole {
  if (slug.startsWith("business-")) return "business";
  if (slug.startsWith("provider-")) return "provider";
  return "customer";
}

// First "# Heading" line becomes the title; falls back to a prettified slug
// (dashes -> spaces, title-cased) if a file is somehow missing one.
function titleOf(slug: string, content: string): string {
  const match = content.match(/^#\s+(.+?)\s*$/m);
  if (match) return match[1];
  const withoutRole = slug.replace(/^(customer|business|provider)-/, "");
  return withoutRole
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const bySlug = new Map<string, GuideDoc>();
for (const [path, content] of Object.entries(files)) {
  const slug = slugOf(path);
  const role = roleOf(slug);
  bySlug.set(slug, { slug, role, title: titleOf(slug, content), content });
}

export function getGuideDoc(slug: string): GuideDoc | null {
  return bySlug.get(slug) ?? null;
}

// All articles for one role, alphabetised by title for a stable, scannable list.
export function guideDocsForRole(role: GuideRole): GuideDocMeta[] {
  return Array.from(bySlug.values())
    .filter((d) => d.role === role)
    .map(({ slug, title, role }) => ({ slug, title, role }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// Every article, for the search box to filter across all roles at once.
export const ALL_GUIDE_DOCS: GuideDoc[] = Array.from(bySlug.values());
