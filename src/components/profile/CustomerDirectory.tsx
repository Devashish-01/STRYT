import { useMemo, useState } from "react";
import { ChevronRight, Search, X } from "@/components/Icons";
import { filterDirectoryGroups, type DirectoryGroup, type DirectoryRow } from "./directoryFilter";

interface CustomerDirectoryProps {
  groups: DirectoryGroup[];
  searchPlaceholder: string;
  searchClearLabel: string;
  searchEmptyMessage: (query: string) => string;
  isDesktop?: boolean;
}

const BADGE_CLASS: Record<NonNullable<DirectoryRow["badgeTone"]>, string> = {
  brand: "badge-purple",
  amber: "badge-amber",
  green: "badge-green",
  red: "badge-red",
};

/**
 * Instagram-inspired flat grouped profile directory with instant search.
 * Uses semantic design tokens only so light/ambient surfaces stay consistent.
 */
export default function CustomerDirectory({
  groups,
  searchPlaceholder,
  searchClearLabel,
  searchEmptyMessage,
  isDesktop = false,
}: CustomerDirectoryProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterDirectoryGroups(groups, query), [groups, query]);

  return (
    <div className={isDesktop ? "ig-dir ig-dir--desktop" : "ig-dir"}>
      <div className="ig-search-wrap">
        <div className="ig-search-box">
          <Search size={17} className="ig-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="ig-search-input"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="ig-search-clear"
              onClick={() => setQuery("")}
              aria-label={searchClearLabel}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ig-empty">
          <p className="small muted">{searchEmptyMessage(query.trim())}</p>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setQuery("")}
          >
            {searchClearLabel}
          </button>
        </div>
      ) : (
        <div className="ig-sections">
          {filtered.map((group, idx) => (
            <section key={group.id} className="ig-section">
              {idx > 0 && <div className="ig-band" aria-hidden="true" />}
              <div className="ig-section-header">{group.title}</div>
              {group.slot && <div className="ig-section-slot">{group.slot}</div>}
              <div className="ig-rows">
                {group.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`ig-row${row.tone ? ` ig-row--${row.tone}` : ""}`}
                    onClick={row.onClick}
                  >
                    {row.icon && <span className="ig-row-icon">{row.icon}</span>}
                    <span className="ig-row-body">
                      <span className="ig-row-label">{row.label}</span>
                      {row.hint && <span className="ig-row-hint">{row.hint}</span>}
                    </span>
                    {row.badge && (
                      <span className={`badge ${BADGE_CLASS[row.badgeTone ?? "brand"]} ig-row-badge`}>
                        {row.badge}
                      </span>
                    )}
                    {row.value && <span className="ig-row-value ellipsis">{row.value}</span>}
                    {!row.hideChevron && (
                      <ChevronRight size={17} className="ig-row-chevron" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
