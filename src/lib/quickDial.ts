/**
 * Geometry of the business console's quick dial: a half-circle fan of round shortcuts that opens above the Home button and
 * turns like a rotary dial. Pure maths, kept out of the component so it can be tested.
 *
 * Slot 0 is straight above the button; each slot either side is DIAL_STEP_DEG further round. Five circles are on screen at
 * once (DIAL_HALF each side of the middle). With more than five items the ring wraps: dragging turns it, and an item that
 * leaves one end comes back at the other. With five or fewer there is nothing to turn, so they sit centred and fixed.
 */

export const DIAL_HALF = 2;
export const DIAL_VISIBLE = DIAL_HALF * 2 + 1;
export const DIAL_STEP_DEG = 34;
/** Widest the arc gets (phones and up); narrower screens shrink it so the end circles never leave the screen. */
export const DIAL_RADIUS = 150;
export const DIAL_MIN_RADIUS = 104;
/** Diameter of one circle, px. */
export const DIAL_ITEM = 60;
/** How far a finger travels (px) to turn the ring by one item. */
export const DIAL_DRAG_PX = 56;

export interface DialSlot {
  /** Signed distance from the middle slot, in items. Fractional while the ring is mid-turn. */
  k: number;
  /** Offsets from the Home button's centre, in px (negative y = up). */
  x: number;
  y: number;
  scale: number;
  opacity: number;
  /** Anything not visible is hidden from taps and from assistive technology. */
  visible: boolean;
  /** The item sitting in (or nearest to) the middle slot. */
  focused: boolean;
}

/** Whether this many items need a turnable ring. */
export const isRing = (n: number) => n > DIAL_VISIBLE;

/** Distance of item `i` from the middle slot when the ring is turned by `offset`, wrapped into [-n/2, n/2). */
export function ringDistance(i: number, offset: number, n: number): number {
  const raw = i - offset;
  return ((((raw + n / 2) % n) + n) % n) - n / 2;
}

/** The arc's radius for a screen this wide: as big as it can be while the outermost circles stay fully on screen. */
export function dialRadius(viewWidth: number): number {
  const w = Math.min(viewWidth, 480); // the app column never gets wider than this
  const reach = Math.sin((DIAL_HALF * DIAL_STEP_DEG * Math.PI) / 180);
  const fit = (w / 2 - (DIAL_ITEM / 2 + 10)) / reach;
  return Math.round(Math.max(DIAL_MIN_RADIUS, Math.min(DIAL_RADIUS, fit)));
}

export function dialSlot(i: number, offset: number, n: number, radius: number = DIAL_RADIUS): DialSlot {
  const k = isRing(n) ? ringDistance(i, offset, n) : i - (n - 1) / 2;
  const abs = Math.abs(k);
  const rad = (k * DIAL_STEP_DEG * Math.PI) / 180;
  // Past the last visible slot an item fades out over one slot instead of popping, so turning looks continuous.
  const fade = Math.max(0, Math.min(1, DIAL_HALF + 1 - abs));
  return {
    k,
    x: Math.round(Math.sin(rad) * radius * 10) / 10,
    y: Math.round(-Math.cos(rad) * radius * 10) / 10,
    scale: 1 - 0.14 * Math.min(abs, DIAL_HALF) / DIAL_HALF,
    opacity: fade,
    visible: abs <= DIAL_HALF + 0.5,
    focused: abs < 0.5,
  };
}

/** The ring's turn after a drag of `dx` px from `base`: dragging right carries the items right, so the offset goes down. */
export function offsetFromDrag(base: number, dx: number): number {
  return base - dx / DIAL_DRAG_PX;
}

/** Rest position: the nearest whole item, wrapped into [0, n). */
export function snapOffset(offset: number, n: number): number {
  if (!isRing(n)) return 0;
  const r = Math.round(offset);
  return ((r % n) + n) % n;
}

/** Index of the item in the middle slot at rest. */
export function focusedIndex(offset: number, n: number): number {
  if (n <= 0) return -1;
  return isRing(n) ? snapOffset(offset, n) : Math.floor((n - 1) / 2);
}

/** Keyboard / button step: one item round, wrapping. No-op when the items don't turn. */
export function stepOffset(offset: number, n: number, dir: 1 | -1): number {
  return isRing(n) ? snapOffset(offset + dir, n) : 0;
}
