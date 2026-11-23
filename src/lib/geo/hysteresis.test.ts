import { describe, it, expect } from "vitest";
import {
  isInsideGeofenceConservative,
  isOutsideGeofenceConfident,
  evaluateGeofenceState,
  GeofenceDebouncer,
} from "./hysteresis";

describe("Geofence Uncertainty & Hysteresis Engine", () => {
  describe("isInsideGeofenceConservative", () => {
    it("returns true when uncertainty disk fits completely inside boundary", () => {
      // radius = 100, epsilon = 20 -> ceiling = 80
      // distance = 60, accuracy = 15 -> 75 <= 80 -> true
      expect(isInsideGeofenceConservative(60, 15, 100, 20)).toBe(true);
    });

    it("returns false when uncertainty disk crosses the conservative buffer", () => {
      // distance = 70, accuracy = 15 -> 85 > 80 -> false
      expect(isInsideGeofenceConservative(70, 15, 100, 20)).toBe(false);
    });

    it("returns false when distance itself is outside radius", () => {
      expect(isInsideGeofenceConservative(105, 5, 100, 20)).toBe(false);
    });
  });

  describe("isOutsideGeofenceConfident", () => {
    it("returns true when nearest edge of uncertainty disk is outside boundary + epsilon", () => {
      // radius = 100, epsilon = 20 -> floor = 120
      // distance = 140, accuracy = 15 -> 125 >= 120 -> true
      expect(isOutsideGeofenceConfident(140, 15, 100, 20)).toBe(true);
    });

    it("returns false when uncertainty disk overlaps into boundary zone", () => {
      // distance = 125, accuracy = 15 -> 110 < 120 -> false
      expect(isOutsideGeofenceConfident(125, 15, 100, 20)).toBe(false);
    });
  });

  describe("evaluateGeofenceState with Hysteresis", () => {
    it("transitions from OUTSIDE to INSIDE when confident entry occurs", () => {
      const state = evaluateGeofenceState({
        currentState: "OUTSIDE",
        distanceMeters: 50,
        accuracyMeters: 10,
        radiusMeters: 100,
        epsilonMeters: 20,
      });
      expect(state).toBe("INSIDE");
    });

    it("preserves INSIDE state while in the intermediate buffer zone", () => {
      // In buffer zone: (100 - 20) < (85 + 10) < (100 + 20)
      const state = evaluateGeofenceState({
        currentState: "INSIDE",
        distanceMeters: 85,
        accuracyMeters: 10,
        radiusMeters: 100,
        epsilonMeters: 20,
      });
      // Should NOT flutter to OUTSIDE
      expect(state).toBe("INSIDE");
    });

    it("preserves OUTSIDE state while in the intermediate buffer zone", () => {
      const state = evaluateGeofenceState({
        currentState: "OUTSIDE",
        distanceMeters: 85,
        accuracyMeters: 10,
        radiusMeters: 100,
        epsilonMeters: 20,
      });
      // Should NOT flutter to INSIDE
      expect(state).toBe("OUTSIDE");
    });

    it("transitions from INSIDE to OUTSIDE when confident exit occurs", () => {
      const state = evaluateGeofenceState({
        currentState: "INSIDE",
        distanceMeters: 150,
        accuracyMeters: 10,
        radiusMeters: 100,
        epsilonMeters: 20,
      });
      expect(state).toBe("OUTSIDE");
    });
  });

  describe("GeofenceDebouncer", () => {
    it("requires 2 consecutive stable samples before transitioning", () => {
      const debouncer = new GeofenceDebouncer("OUTSIDE", 2);
      expect(debouncer.getState()).toBe("OUTSIDE");

      // Sample 1: Inside reading (1st sample, should NOT transition yet)
      const res1 = debouncer.push({
        distanceMeters: 50,
        accuracyMeters: 10,
        radiusMeters: 100,
      });
      expect(res1.didTransition).toBe(false);
      expect(res1.state).toBe("OUTSIDE");
      expect(debouncer.getState()).toBe("OUTSIDE");

      // Sample 2: Inside reading (2nd consecutive sample, SHOULD transition)
      const res2 = debouncer.push({
        distanceMeters: 52,
        accuracyMeters: 8,
        radiusMeters: 100,
      });
      expect(res2.didTransition).toBe(true);
      expect(res2.state).toBe("INSIDE");
      expect(debouncer.getState()).toBe("INSIDE");
    });

    it("ignores isolated single GPS multipath glitch without transitioning", () => {
      const debouncer = new GeofenceDebouncer("INSIDE", 2);

      // Single outside glitch
      const glitch = debouncer.push({
        distanceMeters: 200,
        accuracyMeters: 5,
        radiusMeters: 100,
      });
      expect(glitch.didTransition).toBe(false);
      expect(debouncer.getState()).toBe("INSIDE");

      // Next fix is back inside
      const backInside = debouncer.push({
        distanceMeters: 40,
        accuracyMeters: 10,
        radiusMeters: 100,
      });
      expect(backInside.didTransition).toBe(false);
      expect(debouncer.getState()).toBe("INSIDE");
    });
  });
});
