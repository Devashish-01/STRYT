import { describe, expect, it } from "vitest";
import { DIAL_HALF, DIAL_ITEM, DIAL_MIN_RADIUS, DIAL_RADIUS, dialRadius, dialSlot, focusedIndex, isRing, offsetFromDrag, ringDistance, snapOffset, stepOffset } from "./quickDial";

describe("a dial with five or fewer items", () => {
  it("does not turn, and centres what it has", () => {
    expect(isRing(5)).toBe(false);
    const three = [0, 1, 2].map((i) => dialSlot(i, 0, 3));
    expect(three.map((s) => s.k)).toEqual([-1, 0, 1]);
    expect(three[1]).toMatchObject({ x: 0, focused: true, visible: true, opacity: 1 });
    expect(three[1].y).toBe(-DIAL_RADIUS);
  });

  it("is symmetric about the vertical, and an even count still straddles it", () => {
    const [a, b] = [0, 1].map((i) => dialSlot(i, 0, 2));
    expect(a.x).toBeCloseTo(-b.x);
    expect(a.y).toBeCloseTo(b.y);
  });

  it("shows every item", () => {
    expect([0, 1, 2, 3, 4].every((i) => dialSlot(i, 0, 5).visible)).toBe(true);
  });

  it("ignores the offset", () => {
    expect(dialSlot(1, 3.7, 4)).toEqual(dialSlot(1, 0, 4));
    expect(stepOffset(0, 4, 1)).toBe(0);
    expect(snapOffset(2.4, 4)).toBe(0);
  });
});

describe("a dial that turns", () => {
  const n = 9;

  it("shows exactly five at rest, with the item at the offset in the middle", () => {
    for (const offset of [0, 3, 8]) {
      const slots = Array.from({ length: n }, (_, i) => dialSlot(i, offset, n));
      expect(slots.filter((s) => s.visible)).toHaveLength(5);
      expect(slots.filter((s) => s.focused)).toHaveLength(1);
      expect(slots[offset].focused).toBe(true);
      expect(focusedIndex(offset, n)).toBe(offset);
    }
  });

  it("wraps: an item that leaves one end comes back at the other", () => {
    expect(ringDistance(8, 0, n)).toBe(-1); // the last item sits just left of the first
    expect(ringDistance(1, 8, n)).toBe(2); // and the second is two to the right once the last is in the middle
    for (let i = 0; i < n; i++) {
      const k = ringDistance(i, 4.3, n);
      expect(k).toBeGreaterThanOrEqual(-n / 2);
      expect(k).toBeLessThan(n / 2);
    }
  });

  it("fades items out over one slot as they leave, rather than popping", () => {
    const edge = dialSlot(0, 0.5, n); // k = -0.5: fully in
    expect(edge.opacity).toBe(1);
    const leaving = dialSlot(0, 2.5, n); // k = -2.5: half way out
    expect(leaving.opacity).toBeCloseTo(0.5);
    expect(leaving.visible).toBe(true);
    const gone = dialSlot(0, 3, n); // k = -3
    expect(gone.opacity).toBe(0);
    expect(gone.visible).toBe(false);
  });

  it("shrinks items toward the ends so the middle reads as the focus", () => {
    expect(dialSlot(0, 0, n).scale).toBe(1);
    expect(dialSlot(2, 0, n).scale).toBeLessThan(dialSlot(1, 0, n).scale);
    expect(dialSlot(2, 0, n).scale).toBeGreaterThan(0.8);
  });

  it("keeps every visible circle above the button and inside the arc", () => {
    for (let i = 0; i < n; i++) {
      const s = dialSlot(i, 0, n);
      if (!s.visible) continue;
      expect(s.y).toBeLessThan(0);
      expect(Math.hypot(s.x, s.y)).toBeCloseTo(DIAL_RADIUS, 0);
      expect(Math.abs(s.k)).toBeLessThanOrEqual(DIAL_HALF + 0.5);
    }
  });
});

describe("turning", () => {
  it("dragging right carries the items right (the offset goes down), and left the other way", () => {
    expect(offsetFromDrag(3, 56)).toBe(2);
    expect(offsetFromDrag(3, -112)).toBe(5);
  });

  it("settles on the nearest whole item, wrapped", () => {
    expect(snapOffset(2.4, 9)).toBe(2);
    expect(snapOffset(2.6, 9)).toBe(3);
    expect(snapOffset(-0.6, 9)).toBe(8);
    expect(snapOffset(9.2, 9)).toBe(0);
  });

  it("steps one item at a time with the keyboard and wraps at both ends", () => {
    expect(stepOffset(0, 9, 1)).toBe(1);
    expect(stepOffset(8, 9, 1)).toBe(0);
    expect(stepOffset(0, 9, -1)).toBe(8);
  });

  it("has no focused item when there are none", () => {
    expect(focusedIndex(0, 0)).toBe(-1);
  });
});

describe("fitting the screen", () => {
  it("uses the full arc on a normal phone and never more than it needs on a wide one", () => {
    expect(dialRadius(390)).toBe(DIAL_RADIUS);
    expect(dialRadius(1280)).toBe(DIAL_RADIUS); // the app column stops at 480px
  });

  it("shrinks on a narrow screen, but never below the floor", () => {
    expect(dialRadius(320)).toBeLessThan(DIAL_RADIUS);
    expect(dialRadius(200)).toBe(DIAL_MIN_RADIUS);
  });

  it("keeps the outermost circles fully on screen at every width a phone has", () => {
    for (const w of [320, 340, 360, 375, 390, 412, 480]) {
      const r = dialRadius(w);
      const edge = Math.abs(dialSlot(0, 0, 9, r).x); // k = -2: the far end of a full ring
      const far = Math.max(...[0, 1, 2, 3, 4].map((i) => Math.abs(dialSlot(i, 0, 5, r).x)));
      expect(far + DIAL_ITEM / 2, `width ${w}`).toBeLessThanOrEqual(w / 2);
      expect(edge).toBeGreaterThanOrEqual(0);
    }
  });

  it("puts the circles on the radius it was given", () => {
    const s = dialSlot(0, 0, 9, 120);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(120, 0);
  });
});
