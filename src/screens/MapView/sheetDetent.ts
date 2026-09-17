export type MapSheetDetent = "peek" | "half" | "full";

/** Exported so the filter strip's List/Map chip can cycle detents the exact
 *  same way the grip handle does — one cycle definition, two affordances. */
export const NEXT_DETENT: Record<MapSheetDetent, MapSheetDetent> = { peek: "half", half: "full", full: "peek" };
