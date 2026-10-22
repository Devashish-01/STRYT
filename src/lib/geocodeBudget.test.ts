import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ primary: vi.fn(), fallback: vi.fn() }));
vi.mock("@/lib/geo", () => ({
  primaryProvider: () => ({ id: "primary", reverse: mocks.primary, forward: async () => [] }),
  fallbackProvider: () => ({ id: "fallback", reverse: mocks.fallback, forward: async () => [] }),
}));
vi.mock("@/config", () => ({ config: { mapboxToken: "t" } }));

import { AREA_NAME_BUDGET_MS, reverseGeocode } from "./geocode";

const empty = { area: null, city: null, road: null, featureName: null, postcode: null };

beforeEach(() => {
  vi.useRealTimers();
  mocks.primary.mockReset();
  mocks.fallback.mockReset();
  try { localStorage.clear(); } catch { /* node: no localStorage */ }
});

describe("reverseGeocode never keeps a screen waiting", () => {
  it("gives the area name straight away when the first geocoder has one", async () => {
    mocks.primary.mockResolvedValue({ ...empty, area: "Koregaon Park" });
    await expect(reverseGeocode(18.5362, 73.8939)).resolves.toBe("Koregaon Park");
  });

  it("returns null within the budget when every geocoder is stalled", async () => {
    mocks.primary.mockImplementation(() => new Promise(() => {}));
    mocks.fallback.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    await expect(reverseGeocode(10.1111, 20.2222, 60)).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("returns null rather than throwing when the geocoders fail", async () => {
    mocks.primary.mockRejectedValue(new Error("network"));
    mocks.fallback.mockRejectedValue(new Error("network"));
    await expect(reverseGeocode(11.1111, 21.2222, 3000)).resolves.toBeNull();
  }, 10_000);

  it("keeps working in the background and has the answer ready next time", async () => {
    let release!: (v: unknown) => void;
    mocks.primary.mockImplementation(() => new Promise((r) => { release = r; }));
    await expect(reverseGeocode(12.3456, 22.3456, 40)).resolves.toBeNull(); // too slow for this caller
    release({ ...empty, area: "Baner" }); // …but the lookup finishes
    await new Promise((r) => setTimeout(r, 20));
    mocks.primary.mockReset(); // the next ask must not need the network
    await expect(reverseGeocode(12.3456, 22.3456)).resolves.toBe("Baner");
    expect(mocks.primary).not.toHaveBeenCalled();
  });

  it("has a budget a person will actually wait for", () => {
    expect(AREA_NAME_BUDGET_MS).toBeLessThanOrEqual(5000);
  });
});
