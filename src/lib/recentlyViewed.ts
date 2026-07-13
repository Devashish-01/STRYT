// Local history of business/provider detail pages the user has opened —
// powers the "recently viewed" rail on Home. Mirrors Search.tsx's recent-
// searches pattern (localStorage, deduped, most-recent-first, capped).

export interface RecentlyViewedEntry {
  type: "business" | "provider";
  id: string;
  name: string;
  image: string;
  viewedAt: string;
}

const KEY = "stryt_recently_viewed";
const CAP = 12;

export function pushRecentlyViewed(entry: Omit<RecentlyViewedEntry, "viewedAt">): void {
  try {
    const list = getRecentlyViewed();
    const next = [
      { ...entry, viewedAt: new Date().toISOString() },
      ...list.filter((e) => !(e.type === entry.type && e.id === entry.id)),
    ].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* localStorage unavailable — skip silently */ }
}

export function getRecentlyViewed(): RecentlyViewedEntry[] {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}
