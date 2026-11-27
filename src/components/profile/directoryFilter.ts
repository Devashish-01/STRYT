import type { ReactNode } from "react";

export interface DirectoryRow {
  id: string;
  icon?: ReactNode;
  label: string;
  hint?: string;
  value?: string;
  badge?: string;
  badgeTone?: "brand" | "amber" | "green" | "red";
  tone?: "default" | "accent" | "danger";
  hideChevron?: boolean;
  keywords?: string;
  onClick: () => void;
}

export interface DirectoryGroup {
  id: string;
  title: string;
  /** Optional rich block rendered at the top of this section when not filtering by search. */
  slot?: ReactNode;
  rows: DirectoryRow[];
}

/** Filter grouped directory sections across title, label, hint, value, and keywords; drops slots during active search. */
export function filterDirectoryGroups(groups: DirectoryGroup[], query: string): DirectoryGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((g) => ({
      ...g,
      slot: undefined,
      rows: g.rows.filter((r) =>
        `${g.title} ${r.label} ${r.hint ?? ""} ${r.value ?? ""} ${r.keywords ?? ""}`
          .toLowerCase()
          .includes(needle)
      ),
    }))
    .filter((g) => g.rows.length > 0);
}
