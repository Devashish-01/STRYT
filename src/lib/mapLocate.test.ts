import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: true,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  openSettings: vi.fn(),
  getCurrentPosition: vi.fn(),
  getQuickPosition: vi.fn(),
  getPrecisePosition: vi.fn(),
  getCalibratedPosition: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
  },
}));

vi.mock("@/lib/backgroundLocation", () => ({
  backgroundLocation: { openSettings: mocks.openSettings },
}));

vi.mock("@/lib/nativeGeolocation", () => ({
  nativeGeolocation: {
    getCurrentPosition: mocks.getCurrentPosition,
    getQuickPosition: mocks.getQuickPosition,
    getPrecisePosition: mocks.getPrecisePosition,
    getCalibratedPosition: mocks.getCalibratedPosition,
  },
}));

import { createTapPairHandler, locateWithCalibration, recognizeLocation, requestPreciseLocation } from "./mapLocate";

const samplePos = (accuracy = 15) =>
  ({ coords: { latitude: 18.52, longitude: 73.93, accuracy }, timestamp: 1 }) as GeolocationPosition;

beforeEach(() => {
  mocks.native = true;
  mocks.checkPermissions.mockReset();
  mocks.requestPermissions.mockReset();
  mocks.openSettings.mockReset();
  mocks.getCurrentPosition.mockReset();
  mocks.getQuickPosition.mockReset();
  mocks.getPrecisePosition.mockReset();
  mocks.getCalibratedPosition.mockReset();
});

describe("createTapPairHandler", () => {
  it("fires single tap immediately and double tap on a second press within window", () => {
    vi.useFakeTimers();
    const single = vi.fn();
    const dbl = vi.fn();
    const tap = createTapPairHandler(single, dbl, 300);

    tap();
    expect(single).toHaveBeenCalledTimes(1);
    expect(dbl).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    tap();
    expect(dbl).toHaveBeenCalledTimes(1);

    // Next tap starts a fresh single/double cycle
    vi.advanceTimersByTime(50);
    tap();
    expect(single).toHaveBeenCalledTimes(2);
    expect(dbl).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("recognizeLocation (1-tap)", () => {
  it("uses quick non-nagging read when user chose coarse/approximate location", async () => {
    mocks.checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "granted" });
    mocks.getQuickPosition.mockImplementation((ok: PositionCallback) => ok(samplePos(250)));

    const res = await recognizeLocation();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.getQuickPosition).toHaveBeenCalledTimes(1);
    expect(res.state).toBe("coarse");
    expect(res.fix?.precision).toBe("coarse");
  });

  it("does not re-prompt when location permission is denied", async () => {
    mocks.checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });
    const res = await recognizeLocation();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.getCurrentPosition).not.toHaveBeenCalled();
    expect(res.fix).toBeNull();
    expect(res.state).toBe("denied");
  });
});

describe("requestPreciseLocation (2-tap)", () => {
  it("requests fine location and opens settings when Android locks to coarse", async () => {
    mocks.checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "granted" });
    mocks.requestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "granted" });
    mocks.getPrecisePosition.mockImplementation((ok: PositionCallback) => ok(samplePos(180)));

    const res = await requestPreciseLocation();
    expect(mocks.requestPermissions).toHaveBeenCalledWith({ permissions: ["location"] });
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
    expect(res.openedSettings).toBe(true);
  });

  it("fetches fresh high-accuracy fix when precise permission is granted", async () => {
    mocks.checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    mocks.getPrecisePosition.mockImplementation((ok: PositionCallback) => ok(samplePos(12)));

    const res = await requestPreciseLocation();
    expect(mocks.openSettings).not.toHaveBeenCalled();
    expect(mocks.getPrecisePosition).toHaveBeenCalledTimes(1);
    expect(res.state).toBe("precise");
    expect(res.fix?.precision).toBe("precise");
  });
});

describe("locateWithCalibration (direct 1-tap precise & calibrate)", () => {
  it("requests precise permission directly when prompt/coarse and runs calibration once granted", async () => {
    mocks.checkPermissions.mockResolvedValue({ location: "prompt", coarseLocation: "prompt" });
    mocks.requestPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    mocks.getCalibratedPosition.mockImplementation((ok: PositionCallback) => ok(samplePos(11)));

    const res = await locateWithCalibration();
    expect(mocks.requestPermissions).toHaveBeenCalledWith({ permissions: ["location"] });
    expect(mocks.getCalibratedPosition).toHaveBeenCalledTimes(1);
    expect(mocks.openSettings).not.toHaveBeenCalled();
    expect(res.status).toBe("calibrated");
    expect(res.fix?.precision).toBe("precise");
    expect(res.fix?.accuracy).toBe(11);
  });

  it("returns approximate_locked without opening settings abruptly when OS restricts to coarse", async () => {
    mocks.checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "granted" });
    mocks.requestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "granted" });

    const res = await locateWithCalibration();
    expect(res.status).toBe("approximate_locked");
    expect(res.fix).toBeNull();
    expect(mocks.openSettings).not.toHaveBeenCalled();
  });

  it("skips re-prompting and calibrates directly when precise permission is already granted", async () => {
    mocks.checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    mocks.getCalibratedPosition.mockImplementation((ok: PositionCallback) => ok(samplePos(9)));

    const res = await locateWithCalibration();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.getCalibratedPosition).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("calibrated");
    expect(res.fix?.accuracy).toBe(9);
  });
});
