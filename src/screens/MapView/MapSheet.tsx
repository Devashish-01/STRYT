import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { haptics } from "@/lib/haptics";

export type MapSheetDetent = "peek" | "half" | "full";

/** Exported so the filter strip's List/Map chip can cycle detents the exact
 *  same way the grip handle does — one cycle definition, two affordances. */
export const NEXT_DETENT: Record<MapSheetDetent, MapSheetDetent> = { peek: "half", half: "full", full: "peek" };
const ORDER: MapSheetDetent[] = ["peek", "half", "full"];
/** Below this many px of vertical drag, release snaps back to where it started. */
const DRAG_COMMIT_PX = 40;

/**
 * The drag-to-resize wrapper around the map's results.
 *
 * Recovered from `MapResultsSheet.tsx` (`git show
 * 7d0e068^:src/screens/MapView/MapResultsSheet.tsx`), which built this exact
 * detent machine and was then deleted the same day —
 * `MAP_SNAPCHAT_STYLE_PLAN.md`'s decision D1 replaced it with a fixed-height
 * carousel ("carousel replaces the sheet"). Reinstated because what D1 was
 * actually solving for (six competing overlays, four `:has()` selectors doing
 * layout arithmetic) is not what came back: this only restores drag-to-resize
 * for the results surface, nothing else D1 removed. The replacement's own
 * "List" toggle — an instant, unanimated full-screen panel that hid the map
 * entirely — never actually solved the problem D1 named either, which is the
 * concrete reason for the reversal (recorded in the tracker doc).
 *
 * Structurally this is a smaller change than it looks: unlike the deleted
 * version, this sheet renders no results itself. `MapCarousel.tsx` — built
 * well after `MapResultsSheet.tsx` was deleted — already renders both forms
 * this needs (a horizontal snap-scroll tray and a vertical list) far better
 * than the old sheet's single hand-rolled row list did. This component only
 * supplies the thing neither the deleted sheet's replacement nor
 * `MapCarousel.tsx` alone ever had: a draggable, animated transition between
 * "peek" (tray) and "half"/"full" (list) instead of a hard, silent cut.
 *
 * Two rules preserved verbatim from the original, because they're still the
 * right rules:
 *   · The handle is a real button — tapping it cycles detents — so a mouse
 *     user is never forced to drag something.
 *   · Dragging is claimed only on the grip. Whatever's below (the tray's
 *     horizontal swipe, the list's vertical scroll) keeps every gesture
 *     inside itself; the map keeps everything outside the sheet.
 */
export function MapSheet({
  detent,
  onDetentChange,
  children,
}: {
  detent: MapSheetDetent;
  onDetentChange: (next: MapSheetDetent) => void;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; detent: MapSheetDetent } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Writes the sheet's REAL measured height (not a guessed constant) into
  // --map-carousel-h, which the pin/recenter FABs, the guest radius notice,
  // and the OSM attribution all already anchor off (index.css). A
  // ResizeObserver — rather than computing height from `detent` — covers the
  // live drag, the detent transition's animation, AND the desktop override
  // (which ignores `detent` entirely) with one mechanism, since it just
  // measures whatever's actually on screen regardless of what put it there.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) document.documentElement.style.setProperty("--map-carousel-h", `${Math.round(h)}px`);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      // Restore the stylesheet default for whoever mounts next — this var
      // name is map-screen-specific, but leaving a stale inline override
      // around is needless once nothing is measuring it anymore.
      document.documentElement.style.removeProperty("--map-carousel-h");
    };
  }, []);

  const cycleDetent = useCallback(() => {
    haptics.selection();
    onDetentChange(NEXT_DETENT[detent]);
  }, [detent, onDetentChange]);

  // Pointer drag on the grip only. Pointer events cover touch and mouse with
  // one code path, and setPointerCapture keeps the gesture even if the
  // finger leaves the grip's bounds mid-drag.
  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = { y: e.clientY, detent };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    setDragY(e.clientY - dragStart.current.y);
  }
  function onPointerUp() {
    const delta = dragY ?? 0;
    if (dragStart.current && Math.abs(delta) > DRAG_COMMIT_PX) {
      const idx = ORDER.indexOf(dragStart.current.detent);
      // Dragging UP (negative clientY delta) opens further.
      const next = delta < 0 ? ORDER[Math.min(ORDER.length - 1, idx + 1)] : ORDER[Math.max(0, idx - 1)];
      if (next !== detent) haptics.selection();
      onDetentChange(next);
    }
    dragStart.current = null;
    setDragY(null);
  }

  return (
    <div
      ref={rootRef}
      className={`map-sheet map-sheet--${detent}`}
      // Live drag offset, cleared on release so the CSS detent transition
      // takes back over. Clamped at -40 the same way the original was — past
      // that the next detent has already committed, so further movement
      // shouldn't visually overshoot the sheet past its own header.
      style={dragY != null ? { transform: `translateY(${Math.max(-40, dragY)}px)`, transition: "none" } : undefined}
    >
      <div
        className="map-sheet__grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          className="map-sheet__handle"
          onClick={cycleDetent}
          aria-label={detent === "full" ? "Collapse results" : "Expand results"}
        />
      </div>
      {children}
    </div>
  );
}
