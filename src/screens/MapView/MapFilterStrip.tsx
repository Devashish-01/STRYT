import { useState } from "react";
import { haptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";

/** Ported from the retired MapResultsSheet — this is still the type every
 * caller (index.tsx, MapCarousel) filters and gates layers by. */
export type ResultFilter = "all" | "business" | "provider" | "request" | "story";

const TYPE_OPTIONS: { id: ResultFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "business", label: "Shops" },
  { id: "provider", label: "People" },
  { id: "request", label: "Asks" },
  { id: "story", label: "Stories" },
];

/**
 * The map's persistent top-of-screen chrome besides search and the two FABs
 * (MAP_SNAPCHAT_STYLE_PLAN.md §2.1, Phase B) — a type filter and an
 * "open now" toggle, replacing the old sheet's filter-chips row, radius row
 * and header toggle all at once.
 *
 * The old sheet gave the type filter and the search radius a full row each
 * because there was room in a drawer. There's no drawer now, so both live
 * behind one `[Label ▾]` chip's popover — that's the "entire persistent
 * chrome" the plan describes, just collapsed rather than dropped.
 */
export function MapFilterStrip({
  filter, setFilter, counts,
  availOnly, setAvailOnly,
  radiusKm, onRadiusChange, radiusOptions = [],
}: {
  filter: ResultFilter;
  setFilter: (f: ResultFilter) => void;
  counts: Record<ResultFilter, number>;
  availOnly: boolean;
  setAvailOnly: (v: boolean) => void;
  radiusKm?: number | null;
  /** Omit to hide the radius section entirely (guests, who are capped). */
  onRadiusChange?: (km: number | null) => void;
  radiusOptions?: { label: string; km: number }[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const activeLabel = TYPE_OPTIONS.find((o) => o.id === filter)?.label ?? "All";

  return (
    <div className="map-filter-strip">
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className={`chip map-glass-panel${filter !== "all" ? " active" : ""}`}
          onClick={() => { haptics.selection(); setOpen((v) => !v); }}
        >
          {activeLabel} ▾
        </button>

        {open && (
          <>
            {/* Full-screen tap-catcher — closes the popover on an outside tap
                without a document-level listener (which would need its own
                cleanup dance around every early return in this component). */}
            <div
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 1009 }}
            />
            <div
              className="map-glass-panel"
              style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0, minWidth: 190,
                borderRadius: 16, padding: 10, zIndex: 1010,
              }}
            >
              <div className="tiny semi muted" style={{ padding: "2px 6px 6px" }}>Show</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`chip tiny${filter === o.id ? " active" : ""}`}
                    onClick={() => { haptics.selection(); setFilter(o.id); setOpen(false); }}
                  >
                    {o.label}
                    {counts[o.id] > 0 && <span className="tiny" style={{ marginLeft: 5, opacity: 0.7 }}>{counts[o.id]}</span>}
                  </button>
                ))}
              </div>

              {onRadiusChange && (
                <>
                  <div className="tiny semi muted" style={{ padding: "10px 6px 6px" }}>Within</div>
                  <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                    <button
                      type="button"
                      className={`chip tiny${radiusKm == null ? " active" : ""}`}
                      onClick={() => { haptics.selection(); onRadiusChange(null); }}
                      title="Search whatever the map is showing"
                    >
                      Map view
                    </button>
                    {radiusOptions.map((r) => (
                      <button
                        key={r.km}
                        type="button"
                        className={`chip tiny${radiusKm === r.km ? " active" : ""}`}
                        onClick={() => { haptics.selection(); onRadiusChange(r.km); }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        className={`chip map-glass-panel${availOnly ? " active" : ""}`}
        onClick={() => { haptics.selection(); setAvailOnly(!availOnly); }}
      >
        {t("map_open_now") || "Open now"}
      </button>
    </div>
  );
}
