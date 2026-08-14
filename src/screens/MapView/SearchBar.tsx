import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, MapPin, Search, X } from "@/components/Icons";
import { forwardGeocode, type GeoPlace } from "@/lib/geocode";
import { discoveryService } from "@/services";
import { distanceLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/** A shop or provider search hit, trimmed to what the dropdown and the map need. */
export interface ShopResult {
  kind: "business" | "provider";
  id: string;
  name: string;
  sub: string;
  lat: number;
  lng: number;
  distanceKm?: number;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

/**
 * The map's search box — finds SHOPS/PEOPLE and AREAS from one input.
 *
 * It used to be location-only (forwardGeocode), which meant a search box
 * sitting on a screen covered in shop pins couldn't find a shop by name — a
 * dead end that sent people back out to Explore. MAP_SNAPCHAT_STYLE_PLAN.md
 * §3 (Phase D). No new backend: `discoveryService.search()` already exists
 * and is what the Search screen itself uses.
 *
 * The two result kinds do different things when picked (§3): an AREA moves
 * the map to browse from; a SHOP moves the map to where it actually is. Both
 * are "take me there" — picking a shop deliberately does NOT navigate to its
 * detail page, so searching from the map keeps you on the map. That's for
 * this phase; once the carousel exists (Phase B/C) picking a shop should also
 * select it there.
 */
export function SearchBar({
  centerLat, centerLng, onPickArea, onPickShop, onResultsVisibleChange,
  areaLabel, onOpenAreaPicker,
}: {
  /** Where to search shops/people FROM — the current map center, not the user's saved location. */
  centerLat: number;
  centerLng: number;
  onPickArea: (area: GeoPlace) => void;
  onPickShop: (item: ShopResult) => void;
  /** Lets the map parent hide filter chips / SearchThisArea while results are open. */
  onResultsVisibleChange?: (visible: boolean) => void;
  /** Current area name, shown in a compact trigger chip alongside the search
   *  input — the fastest path to relocating (GPS or a nearby-area tap, one
   *  sheet, one more tap) instead of typing. Omitted entirely when there's no
   *  handler, so a caller that doesn't wire it up (there is none today, but
   *  keeps this component honestly optional) renders exactly as before. */
  areaLabel?: string;
  onOpenAreaPicker?: () => void;
}) {
  const nav = useNavigate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [areaResults, setAreaResults] = useState<GeoPlace[]>([]);
  const [shopResults, setShopResults] = useState<ShopResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Outside-tap dismiss closes the panel without clearing the query — reset
  // when the debounced query changes so a new keystroke reopens results.
  const [panelDismissed, setPanelDismissed] = useState(false);

  // Same 300ms debounce convention as the full Search screen — a keystroke
  // must not fire a Supabase query AND a geocode lookup on every character.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPanelDismissed(false);
  }, [debounced]);

  useEffect(() => {
    let active = true;
    if (debounced.length < MIN_QUERY_LEN) {
      setAreaResults([]);
      setShopResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    Promise.all([
      forwardGeocode(debounced),
      discoveryService.search(debounced, { lat: centerLat, lng: centerLng }),
    ])
      .then(([areas, shops]) => {
        if (!active) return;
        setAreaResults(areas.slice(0, 4));
        const combined: ShopResult[] = [
          ...shops.businesses.data
            .filter((b) => b.lat != null && b.lng != null)
            .map((b): ShopResult => ({
              kind: "business", id: b.id, name: b.name,
              sub: b.subCategory || b.categoryName || "Shop",
              lat: b.lat!, lng: b.lng!, distanceKm: b.distanceKm,
            })),
          ...shops.providers.data
            .filter((p) => p.lat != null && p.lng != null)
            .map((p): ShopResult => ({
              kind: "provider", id: p.id, name: p.displayName,
              sub: p.categoryName || "Provider",
              lat: p.lat!, lng: p.lng!, distanceKm: p.distanceKm,
            })),
        ]
          .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
          .slice(0, 5);
        setShopResults(combined);
      })
      .finally(() => { if (active) setSearching(false); });
    return () => { active = false; };
  }, [debounced, centerLat, centerLng]);

  function clear() {
    setQuery("");
    setDebounced("");
    setAreaResults([]);
    setShopResults([]);
    setPanelDismissed(false);
  }

  function dismissPanel() {
    setPanelDismissed(true);
  }

  function pickArea(a: GeoPlace) {
    onPickArea(a);
    clear();
  }

  function pickShop(s: ShopResult) {
    onPickShop(s);
    clear();
  }

  const hasResults = areaResults.length > 0 || shopResults.length > 0;
  // The panel shows once there's something to show OR once a search is
  // actually in flight for a long-enough query — otherwise "Searching…" below
  // could never render, since it lived inside the same hasResults gate as the
  // results it's meant to appear before.
  const showPanel = !panelDismissed && (hasResults || (searching && debounced.length >= MIN_QUERY_LEN));

  useEffect(() => {
    onResultsVisibleChange?.(showPanel);
  }, [showPanel, onResultsVisibleChange]);

  return (
    <div className="map-screen__search">
      <button
        className="icon-btn map-glass-panel"
        style={{ flexShrink: 0 }}
        onClick={() => nav(-1)}
      >
        <ArrowLeft size={20} />
      </button>

      {/* ONE glass pill, not two side by side — relocating (area button) and
          finding something (search field) used to be visually identical
          floating chips, which read as "two search boxes, which one do I
          use?" rather than one bar with a leading location control, the way
          a single considered search field should. */}
      <div className="map-glass-panel map-search-unified">
        {onOpenAreaPicker && (
          <>
            {/* The fast path: one tap opens LocationPickerSheet (GPS or a
                tappable nearby-area list, no typing) instead of typing into
                the field beside it. Truncated hard — this is a leading
                control, not a place for a long name. */}
            <button
              type="button"
              className="map-search-unified__area"
              onClick={onOpenAreaPicker}
            >
              <MapPin size={13} />
              <span className="ellipsis">{areaLabel || t("map_set_area")}</span>
              <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.55 }} />
            </button>
            <span className="map-glass-divider" aria-hidden />
          </>
        )}

        <div className="map-search-unified__field">
          <Search size={16} color="var(--ink-400)" style={{ flexShrink: 0 }} />
          <input
            type="text"
            className="map-search-unified__input"
            value={query}
            placeholder={t("map_search_location_remotely")}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={clear}
              aria-label="Clear search"
              className="icon-btn-sm"
              style={{ flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {showPanel && (
          <>
            {/* Full-screen tap-catcher — closes the results without clearing the
                query (same pattern as MapFilterStrip's popover dismiss). */}
            <div
              onClick={dismissPanel}
              style={{ position: "fixed", inset: 0, zIndex: 1009 }}
            />
            <div className="map-glass-panel" style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8,
              borderRadius: 16, overflow: "hidden", zIndex: 1010,
              maxHeight: "60vh", overflowY: "auto",
            }}>
              {shopResults.length > 0 && (
                <div>
                  <div className="tiny semi muted" style={{ padding: "10px 16px 4px" }}>
                    {t("map_search_shops_people")}
                  </div>
                  {shopResults.map((s, idx) => (
                    <button
                      key={`${s.kind}:${s.id}`}
                      onClick={() => pickShop(s)}
                      className="map-search-result-row"
                      style={{
                        borderBottom: idx < shopResults.length - 1 ? "1px solid rgba(226, 221, 240, 0.4)" : "none",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-900)" }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>
                        {s.sub}{s.distanceKm != null ? ` · ${distanceLabel(s.distanceKm, t)}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {areaResults.length > 0 && (
                <div>
                  <div className="tiny semi muted" style={{ padding: "10px 16px 4px" }}>
                    {t("map_search_areas")}
                  </div>
                  {areaResults.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => pickArea(r)}
                      className="map-search-result-row"
                      style={{
                        fontSize: 13, color: "var(--ink-800)",
                        borderBottom: idx < areaResults.length - 1 ? "1px solid rgba(226, 221, 240, 0.4)" : "none",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>{r.area}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.full}</div>
                    </button>
                  ))}
                </div>
              )}

              {searching && !hasResults && (
                <div className="tiny muted" style={{ padding: "12px 16px" }}>{t("map_searching")}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

}
