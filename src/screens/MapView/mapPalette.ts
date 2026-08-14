/**
 * The basemap's Street Light skin.
 *
 * Every branded thing the map does today — the heat glow, the lamp-glow
 * headers — floats ON TOP of a basemap that belongs to nobody: stock
 * OpenFreeMap tiles, identical at 2pm and 2am. This module is what makes the
 * street underneath belong to the app too, and shift with the time of day the
 * same way the rest of the "Living Street Light" system already does.
 *
 * Two hard design rules live here:
 *
 * 1. **Dispatch on `source-layer` + layer `type`, never on layer id.** The
 *    styles we load are OpenMapTiles-schema, so `water` / `landcover` /
 *    `transportation` / `building` / `place` are stable across styles and
 *    across upstream restyles, while the ids on top of them are not. An
 *    unrecognised layer returns no patches and is simply left alone, so a
 *    schema change degrades to "less branded", never to a broken map.
 *
 * 2. **Pure, so it can be tested.** `src/screens/MapView/` had no tests at
 *    all; the palette is the one piece of the basemap work that can be
 *    verified without a GPU, so it lives apart from the component that
 *    applies it.
 *
 * The hexes below are deliberate literals rather than `var(--token)` reads:
 * MapLibre paint is WebGL and cannot resolve CSS variables. That's the same
 * category as the heatmap's `--accent-400` fallback, which is already
 * whitelisted in scripts/check-hardcoded-colors.js for exactly this reason.
 */

export interface MapPalette {
  /** Ground/background fill. */
  land: string;
  /** Water bodies and waterways — brand-tinted, the most recognisable choice here. */
  water: string;
  /** Parks, forest, grass. */
  park: string;
  /** Road fill — the "lit" surface after dark. */
  road: string;
  /** Road outline, always quieter than the fill it wraps. */
  roadCasing: string;
  building: string;
  label: string;
  /** Halo behind label text — tracks `land` so text stays legible on any fill. */
  labelHalo: string;
  boundary: string;
}

/** Soft cream ground, lilac water, white roads — warm, not corporate grey. */
const DAY: MapPalette = {
  land: "#f7f4fb",
  water: "#dcd6f2",
  park: "#e2ecdd",
  road: "#ffffff",
  roadCasing: "#e6dff0",
  building: "#ece6f4",
  label: "#4a4458",
  labelHalo: "#f7f4fb",
  boundary: "#cfc6e6",
};

/**
 * Deep ink-plum ground with AMBER-LIT roads. The roads carrying the warm
 * colour (rather than the whole map inverting to grey) is what makes this
 * read as a lit street at night instead of a dark document.
 */
const NIGHT: MapPalette = {
  land: "#15111d",
  water: "#0b0912",
  park: "#171d17",
  road: "#4d3a1c",
  roadCasing: "#241c14",
  building: "#1e1829",
  label: "#e6e0f2",
  labelHalo: "#15111d",
  boundary: "#2b2340",
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** "#rgb" or "#rrggbb" → [r,g,b]. Returns black for anything unparseable. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(n: number): string {
  return Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, "0");
}

/** Linear blend between two hex colours. `t` 0 → `a`, 1 → `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t);
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `#${toHex(ar + (br - ar) * k)}${toHex(ag + (bg - ag) * k)}${toHex(ab + (bb - ab) * k)}`;
}

/**
 * The basemap palette for a given `lampGlow` (0 → noon, 1 → night) — the same
 * signal `useAmbientTheme` already feeds the heat layer and the header lamps,
 * so the whole app warms together rather than the map inventing its own clock.
 */
export function paletteFor(lampGlow: number): MapPalette {
  const t = clamp01(lampGlow);
  return {
    land: mixHex(DAY.land, NIGHT.land, t),
    water: mixHex(DAY.water, NIGHT.water, t),
    park: mixHex(DAY.park, NIGHT.park, t),
    road: mixHex(DAY.road, NIGHT.road, t),
    roadCasing: mixHex(DAY.roadCasing, NIGHT.roadCasing, t),
    building: mixHex(DAY.building, NIGHT.building, t),
    label: mixHex(DAY.label, NIGHT.label, t),
    labelHalo: mixHex(DAY.labelHalo, NIGHT.labelHalo, t),
    boundary: mixHex(DAY.boundary, NIGHT.boundary, t),
  };
}

/** One paint property to set on a style layer. */
export interface PaintPatch {
  property: string;
  value: string;
}

/** Which palette role a given OpenMapTiles source-layer belongs to. */
function roleFor(sourceLayer: string): keyof MapPalette | null {
  switch (sourceLayer) {
    case "water":
    case "waterway":
    case "ocean":
      return "water";
    case "landcover":
    case "park":
      return "park";
    case "landuse":
      return "land";
    case "building":
      return "building";
    case "transportation":
    case "aeroway":
      return "road";
    case "boundary":
      return "boundary";
    // Every label-bearing source-layer in the schema.
    case "transportation_name":
    case "place":
    case "water_name":
    case "poi":
    case "aerodrome_label":
    case "mountain_peak":
    case "housenumber":
      return "label";
    default:
      return null;
  }
}

/**
 * The paint patches for one style layer, or `[]` to leave it untouched.
 *
 * `layerId` is used ONLY as a soft refinement — a road layer whose id mentions
 * "casing"/"outline" gets the quieter casing colour. Dispatch never depends on
 * it, so a style that names its layers differently still gets the right base
 * colours; it just loses the casing nuance.
 */
export function retintFor(
  sourceLayer: string | undefined,
  layerType: string,
  palette: MapPalette,
  layerId = "",
): PaintPatch[] {
  // The ground plane has no source-layer of its own.
  if (layerType === "background") {
    return [{ property: "background-color", value: palette.land }];
  }

  const role = sourceLayer ? roleFor(sourceLayer) : null;
  if (!role) return [];

  if (layerType === "symbol") {
    // Only labels get symbol treatment; a symbol layer over, say, water is
    // still a label (water_name), so this is safe for every mapped role.
    return [
      { property: "text-color", value: palette.label },
      { property: "text-halo-color", value: palette.labelHalo },
    ];
  }

  const isCasing = /casing|outline/i.test(layerId);
  const color =
    role === "road" && isCasing ? palette.roadCasing : palette[role];

  switch (layerType) {
    case "fill":
      return [{ property: "fill-color", value: color }];
    case "line":
      return [{ property: "line-color", value: color }];
    case "fill-extrusion":
      return [{ property: "fill-extrusion-color", value: palette.building }];
    default:
      // circle / heatmap / raster / anything new — not ours to repaint.
      return [];
  }
}
