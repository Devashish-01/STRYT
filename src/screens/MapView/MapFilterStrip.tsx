import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, SlidersHorizontal } from "@/components/Icons";

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
 * The filter menu popover is portaled to document.body and positioned fixed
 * from the trigger's rect. Rendering it inside the horizontally-scrolling
 * strip clipped it on WebView/mobile, and mounting a full-screen tap-catcher
 * in the same click that opened the menu immediately closed it again.
 */
export function MapFilterStrip({
  filter, setFilter, counts,
  availOnly, setAvailOnly,
  radiusKm, onRadiusChange, radiusOptions = [],
  viewMode = "map", setViewMode,
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
  viewMode?: "map" | "list";
  setViewMode?: (v: "map" | "list") => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [needItNow, setNeedItNow] = useState(false);
  const [catcherArmed, setCatcherArmed] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeLabel = TYPE_OPTIONS.find((o) => o.id === filter)?.label ?? "All";
  const isFiltered = filter !== "all" || radiusKm != null;

  const updateMenuPos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Keep the menu on-screen on narrow phones.
    const left = Math.min(r.left, Math.max(8, window.innerWidth - 216));
    setMenuPos({ top: r.bottom + 8, left: Math.max(8, left) });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCatcherArmed(false);
      return;
    }
    // Arm the outside-tap catcher on the next frame so the opening tap
    // cannot immediately dismiss the menu (common WebView failure mode).
    const frame = requestAnimationFrame(() => setCatcherArmed(true));
    const onReposition = () => updateMenuPos();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const handleNeedItNow = () => {
    haptics.selection();
    if (needItNow) {
      setNeedItNow(false);
      setAvailOnly(false);
    } else {
      setNeedItNow(true);
      setAvailOnly(true);
      setFilter("all");
    }
  };

  const closeMenu = () => setOpen(false);

  const menu = open && menuPos && createPortal(
    <>
      {catcherArmed && (
        <div
          className="map-filter-menu__catcher"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeMenu();
          }}
        />
      )}
      <div
        className="map-glass-panel map-filter-menu__popover"
        role="listbox"
        style={{ top: menuPos.top, left: menuPos.left }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="tiny semi muted" style={{ padding: "2px 8px 8px" }}>Show</div>
        <div className="map-filter-menu__options">
          {TYPE_OPTIONS.map((o) => {
            const selected = filter === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`map-filter-menu__option${selected ? " is-selected" : ""}`}
                onClick={() => {
                  haptics.selection();
                  setNeedItNow(false);
                  setFilter(o.id);
                  closeMenu();
                }}
              >
                <span>{o.label}</span>
                {counts[o.id] > 0 && (
                  <span className="map-filter-menu__count">{counts[o.id]}</span>
                )}
              </button>
            );
          })}
        </div>

        {onRadiusChange && (
          <>
            <div className="tiny semi muted" style={{ padding: "12px 8px 8px" }}>Within</div>
            <div className="row" style={{ flexWrap: "wrap", gap: 6, padding: "0 2px" }}>
              <button
                type="button"
                className={`map-filter-menu__pill${radiusKm == null ? " is-selected" : ""}`}
                onClick={() => { haptics.selection(); onRadiusChange(null); }}
                title="Search whatever the map is showing"
              >
                Map view
              </button>
              {radiusOptions.map((r) => (
                <button
                  key={r.km}
                  type="button"
                  className={`map-filter-menu__pill${radiusKm === r.km ? " is-selected" : ""}`}
                  onClick={() => { haptics.selection(); onRadiusChange(r.km); }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );

  return (
    <div className="map-filter-strip">
      <div className="map-filter-strip__scroll">
        <button
          ref={triggerRef}
          type="button"
          className={[
            "map-filter-menu",
            "map-glass-panel",
            open ? "is-open" : "",
            isFiltered ? "is-filtered" : "",
          ].filter(Boolean).join(" ")}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Filter: ${activeLabel}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            haptics.selection();
            setOpen((v) => !v);
          }}
        >
          <span className="map-filter-menu__icon" aria-hidden>
            <SlidersHorizontal size={13} />
          </span>
          <span className="map-filter-menu__label">{activeLabel}</span>
          {isFiltered && <span className="map-filter-menu__dot" aria-hidden />}
          <ChevronDown size={12} className="map-filter-menu__chevron" />
        </button>

        <button
          type="button"
          className={`chip map-glass-panel${availOnly && !needItNow ? " active" : ""}`}
          onClick={() => {
            haptics.selection();
            setNeedItNow(false);
            setAvailOnly(!availOnly);
          }}
        >
          {t("map_open_now")}
        </button>

        <button
          type="button"
          className={`chip map-glass-panel${needItNow ? " active" : ""}`}
          onClick={handleNeedItNow}
        >
          ⚡ Need it now
        </button>

        {setViewMode && (
          <button
            type="button"
            className={`chip map-glass-panel map-filter-strip__list${viewMode === "list" ? " active" : ""}`}
            onClick={() => {
              haptics.selection();
              setViewMode(viewMode === "map" ? "list" : "map");
            }}
          >
            {viewMode === "map" ? "📜 List" : "🗺️ Map"}
          </button>
        )}
      </div>
      {menu}
    </div>
  );
}
