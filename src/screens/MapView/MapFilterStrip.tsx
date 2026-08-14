import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ListChecks, Map as MapIcon, SlidersHorizontal, Zap } from "@/components/Icons";
import type { MapSheetDetent } from "./MapSheet";
import SearchThisArea from "./SearchThisArea";

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
 * (MAP_SNAPCHAT_STYLE_PLAN.md §2.1, Phase B) — one shared glass pill (a
 * `.map-control-bar`, same technique `SearchBar.tsx`'s merged search+area
 * pill uses) holding three zones separated by hairline dividers: an
 * "Open now" toggle, the Filters trigger (type + radius), and the List/Map
 * toggle.
 *
 * "Open now" briefly lived INSIDE the Filters popover as a "Status" section
 * — cutting the persistent row down to one button. That traded away too
 * much: it's a toggle people reach for constantly, not a settings menu they
 * open occasionally, and burying it a tap deeper made it slower to reach for
 * no real gain. This bar is the resolution — Open now and List/Map stay
 * exactly as reachable as before (one tap, no popover), just visually
 * grouped into one considered control instead of competing as loose
 * separate chips. Only Filters (type + radius, the two things people adjust
 * far less often) still opens a popover.
 *
 * The filter menu popover is portaled to document.body and positioned fixed
 * from the trigger's rect — rendering it as a normal child clipped it on
 * WebView/mobile — and mounting a full-screen tap-catcher in the same click
 * that opened the menu immediately closed it again.
 */
export function MapFilterStrip({
  filter, setFilter, counts,
  availOnly, setAvailOnly,
  radiusKm, onRadiusChange, radiusOptions = [],
  detent = "peek", onCycleDetent,
  searchThisArea,
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
  /** Current results-sheet detent — drives this chip's label/active state. */
  detent?: MapSheetDetent;
  /** Advances the sheet to its next detent — the exact same cycle the sheet's
   *  own grip handle uses (peek → half → full → peek), so tapping this chip
   *  and tapping the handle are two affordances for one action, not two
   *  different ones. Omit to hide the chip entirely (unused today, but keeps
   *  this component honestly optional the way its siblings are). */
  onCycleDetent?: () => void;
  /** When `visible`, replaces just the Filters zone of the control bar with
   *  the "Search this area" CTA — Open now and List/Map, either side of it,
   *  stay put and stay tappable the whole time. Adding this as its own
   *  floating row underneath (the original design) cost this screen a whole
   *  extra row every time it appeared; swapping one zone in an existing bar
   *  costs nothing. Omit to hide entirely (keeps this optional the way its
   *  siblings are). */
  searchThisArea?: { visible: boolean; busy: boolean; onClick: () => void };
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [catcherArmed, setCatcherArmed] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeLabel = TYPE_OPTIONS.find((o) => o.id === filter)?.label ?? "All";
  // Drives the trigger's dot. Deliberately NOT availOnly — that toggle has
  // its own always-visible state in the control bar now, so it doesn't also
  // need to light this dot to be noticed.
  const isFiltered = filter !== "all" || radiusKm != null;

  // "Map view" (null) prepended as its own stop, index 0 — a slider needs a
  // fixed, evenly-spaced set of stops, not 9 discrete buttons. Steps aren't
  // evenly spaced in km (500m to 100km is most of what people actually use;
  // "World" is a 20000km outlier) — indexing into stops, not mapping km
  // linearly onto the track, is what keeps the useful, small-radius end of
  // the slider from being crushed into an unusable sliver next to World.
  const radiusStops = useMemo(
    () => [{ label: "Map view", km: null as number | null }, ...radiusOptions],
    [radiusOptions],
  );
  const radiusIndex = Math.max(0, radiusStops.findIndex((s) => s.km === radiusKm));

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
        <div className="row" style={{ flexWrap: "wrap", gap: 6, padding: "0 2px" }}>
          {TYPE_OPTIONS.map((o) => {
            const selected = filter === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`chip-pill${selected ? " active" : ""}`}
                onClick={() => {
                  haptics.selection();
                  setFilter(o.id);
                  closeMenu();
                }}
              >
                {o.label}
                {counts[o.id] > 0 && (
                  <span className="map-filter-menu__count">{counts[o.id]}</span>
                )}
              </button>
            );
          })}
        </div>

        {onRadiusChange && (
          <>
            <div className="row between" style={{ padding: "12px 8px 2px", alignItems: "baseline" }}>
              <span className="tiny semi muted">Within</span>
              <span className="tiny semi" style={{ color: "var(--brand-600)" }}>
                {radiusStops[radiusIndex].label}
              </span>
            </div>
            <input
              type="range"
              className="map-filter-menu__radius-slider"
              min={0}
              max={radiusStops.length - 1}
              step={1}
              value={radiusIndex}
              list="map-filter-radius-stops"
              aria-label="Search radius"
              aria-valuetext={radiusStops[radiusIndex].label}
              onChange={(e) => {
                const idx = Number(e.target.value);
                haptics.selection();
                onRadiusChange(radiusStops[idx].km);
              }}
            />
            <datalist id="map-filter-radius-stops">
              {radiusStops.map((_, i) => <option key={i} value={i} />)}
            </datalist>
          </>
        )}
      </div>
    </>,
    document.body,
  );

  return (
    <div className="map-glass-panel map-control-bar">
      {/* Open now — icon-led, one tap, no menu. Every zone in this bar has
          its own resting pill shape (see .map-control-bar__toggle /
          .map-filter-menu in index.css) — no divider lines needed between
          them, the pill boundaries already separate them. Active state
          layers a stronger brand tint on top of that same shape. */}
      <button
        type="button"
        className={`map-control-bar__toggle${availOnly ? " active" : ""}`}
        aria-pressed={availOnly}
        onClick={() => { haptics.selection(); setAvailOnly(!availOnly); }}
      >
        <Zap size={15} weight={availOnly ? "fill" : "regular"} />
        <span>{t("map_open_now")}</span>
      </button>

      {searchThisArea?.visible ? (
        <SearchThisArea
          busy={searchThisArea.busy}
          onClick={searchThisArea.onClick}
        />
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={[
            "map-filter-menu",
            open ? "is-open" : "",
            isFiltered ? "is-filtered" : "",
          ].filter(Boolean).join(" ")}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Filters: ${activeLabel}`}
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
      )}

      {onCycleDetent && (
        <button
          type="button"
          className={`map-control-bar__toggle${detent !== "peek" ? " active" : ""}`}
          onClick={onCycleDetent}
        >
          {detent === "peek" ? <ListChecks size={15} /> : <MapIcon size={15} weight="fill" />}
          <span>{detent === "peek" ? "List" : "Map"}</span>
        </button>
      )}

      {menu}
    </div>
  );
}
