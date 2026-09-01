import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ListChecks, Map as MapIcon, Minus, Plus, SlidersHorizontal, Target, Zap } from "@/components/Icons";
import { WORLD_RADIUS_KM } from "@/utils/constants";
import type { MapSheetDetent } from "./MapSheet";
import SearchThisArea from "./SearchThisArea";

/** Ported from the retired MapResultsSheet — this is still the type every
 * caller (index.tsx, MapCarousel) filters and gates layers by. */
export type ResultFilter = "all" | "business" | "provider" | "request" | "story" | "place";

const TYPE_OPTIONS: { id: ResultFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "business", label: "Shops" },
  { id: "provider", label: "People" },
  { id: "request", label: "Asks" },
  { id: "story", label: "Stories" },
  { id: "place", label: "Places" },
];

export function MapFilterStrip({
  filter, setFilter, counts,
  availOnly, setAvailOnly,
  radiusKm, currentRadiusKm, onRadiusChange, radiusOptions = [],
  detent = "peek", onCycleDetent,
  searchThisArea,
}: {
  filter: ResultFilter;
  setFilter: (f: ResultFilter) => void;
  counts: Record<ResultFilter, number>;
  availOnly: boolean;
  setAvailOnly: (v: boolean) => void;
  radiusKm?: number | null;
  /** Live viewport-derived search radius in km */
  currentRadiusKm?: number;
  /** Omit to hide the radius section entirely (guests, who are capped). */
  onRadiusChange?: (km: number | null) => void;
  radiusOptions?: { label: string; km: number }[];
  detent?: MapSheetDetent;
  onCycleDetent?: () => void;
  searchThisArea?: { visible: boolean; busy: boolean; onClick: () => void };
}) {
  const { t } = useI18n();

  // Category Popover State
  const [catOpen, setCatOpen] = useState(false);
  const [catCatcherArmed, setCatCatcherArmed] = useState(false);
  const [catMenuPos, setCatMenuPos] = useState<{ top: number; left: number } | null>(null);
  const catTriggerRef = useRef<HTMLButtonElement>(null);

  // Radius Popover State
  const [radOpen, setRadOpen] = useState(false);
  const [radCatcherArmed, setRadCatcherArmed] = useState(false);
  const [radMenuPos, setRadMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [customInputVal, setCustomInputVal] = useState<string>("");
  const radTriggerRef = useRef<HTMLButtonElement>(null);

  const activeCategoryLabel = TYPE_OPTIONS.find((o) => o.id === filter)?.label ?? "All";
  const effectiveRadius = radiusKm ?? currentRadiusKm;
  const radiusLabel = effectiveRadius
    ? (effectiveRadius >= WORLD_RADIUS_KM ? "🌍 World" : effectiveRadius < 1 ? `${Math.round(effectiveRadius * 1000)}m` : `${effectiveRadius.toFixed(1).replace(/\.0$/, "")}km`)
    : "Auto";

  // Category Popover position calculation
  const updateCatMenuPos = () => {
    const el = catTriggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(r.left, Math.max(8, window.innerWidth - 240));
    setCatMenuPos({ top: r.bottom + 8, left: Math.max(8, left) });
  };

  useLayoutEffect(() => {
    if (!catOpen) {
      setCatMenuPos(null);
      return;
    }
    updateCatMenuPos();
  }, [catOpen]);

  useEffect(() => {
    if (!catOpen) {
      setCatCatcherArmed(false);
      return;
    }
    const frame = requestAnimationFrame(() => setCatCatcherArmed(true));
    const onReposition = () => updateCatMenuPos();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [catOpen]);

  // Radius Popover position calculation
  const updateRadMenuPos = () => {
    const el = radTriggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(r.left, Math.max(8, window.innerWidth - 290));
    setRadMenuPos({ top: r.bottom + 8, left: Math.max(8, left) });
  };

  useLayoutEffect(() => {
    if (!radOpen) {
      setRadMenuPos(null);
      return;
    }
    updateRadMenuPos();
  }, [radOpen]);

  useEffect(() => {
    if (!radOpen) {
      setRadCatcherArmed(false);
      return;
    }
    const frame = requestAnimationFrame(() => setRadCatcherArmed(true));
    const onReposition = () => updateRadMenuPos();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [radOpen]);

  const closeAllMenus = () => {
    setCatOpen(false);
    setRadOpen(false);
    setCustomInputVal("");
  };

  const currentNumericRadius = radiusKm ?? (currentRadiusKm ? Math.round(currentRadiusKm * 10) / 10 : 5);

  // Category Popover
  const categoryMenu = catOpen && catMenuPos && createPortal(
    <>
      {catCatcherArmed && (
        <div
          className="map-filter-menu__catcher"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllMenus();
          }}
        />
      )}
      <div
        className="map-glass-panel map-filter-menu__popover"
        role="listbox"
        style={{ top: catMenuPos.top, left: catMenuPos.left, minWidth: 200 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="tiny semi muted" style={{ padding: "2px 8px 8px" }}>Show on Map</div>
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
                  closeAllMenus();
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
      </div>
    </>,
    document.body,
  );

  // Radius Popover
  const radiusMenu = radOpen && radMenuPos && onRadiusChange && createPortal(
    <>
      {radCatcherArmed && (
        <div
          className="map-filter-menu__catcher"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllMenus();
          }}
        />
      )}
      <div
        className="map-glass-panel map-filter-menu__popover"
        role="listbox"
        style={{ top: radMenuPos.top, left: radMenuPos.left, minWidth: 260 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="row between" style={{ padding: "2px 6px 8px", alignItems: "center" }}>
          <span className="tiny semi muted">Coverage Range (Radius)</span>
          <span className="tiny bold" style={{ color: "var(--brand-600)" }}>
            {radiusKm == null
              ? `Auto (${(currentRadiusKm ?? 5).toFixed(1).replace(/\.0$/, "")} km)`
              : radiusKm >= WORLD_RADIUS_KM
              ? "🌍 World"
              : radiusKm < 1
              ? `${Math.round(radiusKm * 1000)}m`
              : `${radiusKm.toFixed(1).replace(/\.0$/, "")} km`}
          </span>
        </div>

        {/* Quick Presets */}
        <div className="row" style={{ flexWrap: "wrap", gap: 5, padding: "0 2px 8px" }}>
          <button
            type="button"
            className={`chip-pill${radiusKm == null ? " active" : ""}`}
            style={{ fontSize: 11, padding: "4px 8px" }}
            onClick={() => {
              haptics.selection();
              onRadiusChange(null);
            }}
          >
            Auto View
          </button>
          {radiusOptions.map((opt) => (
            <button
              key={opt.km}
              type="button"
              className={`chip-pill${radiusKm === opt.km ? " active" : ""}`}
              style={{ fontSize: 11, padding: "4px 8px" }}
              onClick={() => {
                haptics.selection();
                onRadiusChange(opt.km);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom Radius Stepper & Input */}
        <div className="map-filter-custom-radius-box">
          <span className="tiny muted" style={{ fontWeight: 600 }}>Custom Range:</span>
          <div className="map-filter-stepper">
            <button
              type="button"
              className="map-filter-stepper__btn"
              aria-label="Decrease radius"
              onClick={() => {
                haptics.selection();
                const cur = radiusKm ?? currentRadiusKm ?? 5;
                const delta = cur > 10 ? 5 : (cur > 2 ? 1 : 0.5);
                const next = Math.max(0.5, Math.round((cur - delta) * 10) / 10);
                onRadiusChange(next);
              }}
            >
              <Minus size={12} />
            </button>
            <div className="map-filter-stepper__input-wrap">
              <input
                type="number"
                min={0.5}
                max={WORLD_RADIUS_KM}
                step={0.5}
                className="map-filter-stepper__input"
                value={customInputVal !== "" ? customInputVal : currentNumericRadius}
                onChange={(e) => {
                  setCustomInputVal(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val) && val > 0 && val <= WORLD_RADIUS_KM) {
                    onRadiusChange(val);
                  }
                }}
                onBlur={() => {
                  setCustomInputVal("");
                }}
              />
              <span className="tiny semi muted">km</span>
            </div>
            <button
              type="button"
              className="map-filter-stepper__btn"
              aria-label="Increase radius"
              onClick={() => {
                haptics.selection();
                const cur = radiusKm ?? currentRadiusKm ?? 5;
                const delta = cur >= 1000 ? 500 : cur >= 100 ? 50 : cur >= 10 ? 5 : (cur >= 2 ? 1 : 0.5);
                const next = Math.min(WORLD_RADIUS_KM, Math.round((cur + delta) * 10) / 10);
                onRadiusChange(next);
              }}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>

        {/* Continuous Range Slider */}
        <input
          type="range"
          className="map-filter-menu__radius-slider"
          min={0.5}
          max={50}
          step={0.5}
          value={currentNumericRadius}
          aria-label="Custom search radius"
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (Number.isFinite(val) && val > 0) {
              onRadiusChange(val);
            }
          }}
        />
      </div>
    </>,
    document.body,
  );

  return (
    <div className="map-glass-panel map-control-bar">
      {/* 1. Open now toggle */}
      <button
        type="button"
        className={`map-control-bar__toggle${availOnly ? " active" : ""}`}
        aria-pressed={availOnly}
        onClick={() => {
          haptics.selection();
          setAvailOnly(!availOnly);
        }}
      >
        <Zap size={14} weight={availOnly ? "fill" : "regular"} />
        <span>{t("map_open_now")}</span>
      </button>

      {/* 2. Dedicated Radius / Range button */}
      {onRadiusChange && (
        <button
          ref={radTriggerRef}
          type="button"
          className={`map-control-bar__toggle${radOpen ? " is-open" : ""}${radiusKm != null ? " active" : ""}`}
          aria-expanded={radOpen}
          aria-haspopup="listbox"
          aria-label={`Coverage Radius: ${radiusLabel}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            haptics.selection();
            setCatOpen(false);
            setRadOpen((v) => !v);
          }}
        >
          <Target size={14} weight={radiusKm != null ? "bold" : "regular"} />
          <span>{radiusLabel}</span>
          <ChevronDown size={11} className={`map-chevron${radOpen ? " is-open" : ""}`} />
        </button>
      )}

      {/* 3. Category / Type filter button */}
      {searchThisArea?.visible ? (
        <SearchThisArea
          busy={searchThisArea.busy}
          onClick={searchThisArea.onClick}
        />
      ) : (
        <button
          ref={catTriggerRef}
          type="button"
          className={`map-control-bar__toggle${catOpen ? " is-open" : ""}${filter !== "all" ? " active" : ""}`}
          aria-expanded={catOpen}
          aria-haspopup="listbox"
          aria-label={`Category filter: ${activeCategoryLabel}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            haptics.selection();
            setRadOpen(false);
            setCatOpen((v) => !v);
          }}
        >
          <SlidersHorizontal size={14} weight={filter !== "all" ? "bold" : "regular"} />
          <span>{activeCategoryLabel}</span>
          <ChevronDown size={11} className={`map-chevron${catOpen ? " is-open" : ""}`} />
        </button>
      )}

      {/* 4. List / Map view mode toggle */}
      {onCycleDetent && (
        <button
          type="button"
          className={`map-control-bar__toggle${detent !== "peek" ? " active" : ""}`}
          onClick={onCycleDetent}
        >
          {detent === "peek" ? <ListChecks size={14} /> : <MapIcon size={14} weight="fill" />}
          <span>{detent === "peek" ? "List" : "Map"}</span>
        </button>
      )}

      {categoryMenu}
      {radiusMenu}
    </div>
  );
}
