import { describe, it, expect, beforeEach } from "vitest";
import { GUEST_RADIUS_KM, setGuestMode, isGuestMode, clampRadiusForViewer } from "./guestMode";

describe("guestMode", () => {
  // guestActive is module-level state, not reset between it() blocks by
  // vitest — reset explicitly so one test's setGuestMode(true) can't leak
  // into the next.
  beforeEach(() => setGuestMode(false));

  it("defaults to not-guest", () => {
    expect(isGuestMode()).toBe(false);
  });

  it("setGuestMode toggles isGuestMode", () => {
    setGuestMode(true);
    expect(isGuestMode()).toBe(true);
    setGuestMode(false);
    expect(isGuestMode()).toBe(false);
  });

  describe("clampRadiusForViewer", () => {
    it("passes the requested radius through unchanged for a signed-in viewer", () => {
      setGuestMode(false);
      expect(clampRadiusForViewer(25)).toBe(25);
      expect(clampRadiusForViewer(0.5)).toBe(0.5);
      expect(clampRadiusForViewer(undefined)).toBe(undefined);
    });

    it("clamps a guest's requested radius down to GUEST_RADIUS_KM, never up", () => {
      setGuestMode(true);
      expect(clampRadiusForViewer(25)).toBe(GUEST_RADIUS_KM);
      expect(clampRadiusForViewer(100)).toBe(GUEST_RADIUS_KM);
    });

    it("a guest requesting LESS than the cap keeps their smaller value", () => {
      // The cap is a ceiling, not a fixed override — Math.min, not a flat
      // replace, so a narrower explicit request (e.g. a 500m preset) isn't
      // widened back out to the 1km cap.
      setGuestMode(true);
      expect(clampRadiusForViewer(0.5)).toBe(0.5);
    });

    it("a guest with no requested radius (undefined) gets exactly the cap, not undefined", () => {
      // The real bug this guards against: leaving `undefined` unclamped would
      // let a service fall through to its own default (often 5km+), silently
      // widening a guest past the 1km product limit.
      setGuestMode(true);
      expect(clampRadiusForViewer(undefined)).toBe(GUEST_RADIUS_KM);
    });

    it("a guest's cap is exactly GUEST_RADIUS_KM at the boundary, not off by one", () => {
      setGuestMode(true);
      expect(clampRadiusForViewer(GUEST_RADIUS_KM)).toBe(GUEST_RADIUS_KM);
    });
  });
});
