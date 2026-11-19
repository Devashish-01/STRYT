import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRoadRoute } from "./routing";

describe("getRoadRoute", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to euclidean coordinates when remote APIs are unavailable", async () => {
    // Force fetch to fail
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failed")));

    const origin = { lat: 18.5204, lng: 73.8567 };
    const destination = { lat: 18.525, lng: 73.859 };

    const route = await getRoadRoute(origin, destination);
    expect(route).toBeDefined();
    expect(route.provider).toBe("euclidean");
    expect(route.coordinates).toHaveLength(2);
    expect(route.coordinates[0]).toEqual([18.5204, 73.8567]);
    expect(route.coordinates[1]).toEqual([18.525, 73.859]);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.durationSeconds).toBeGreaterThan(0);
  });
});
