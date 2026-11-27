import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ native: true, get: vi.fn(), watch: vi.fn(), clearWatch: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    getCurrentPosition: mocks.get,
    watchPosition: mocks.watch,
    clearWatch: mocks.clearWatch,
  },
}));

import { FRESH_FIX_MS, nativeGeolocation, phase2Opts, resetGeolocationForTests, totalBudgetMs } from "./nativeGeolocation";

const fix = (lat = 18.5, lng = 73.9, accuracy = 20) => ({ coords: { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: 1 });
const never = () => new Promise(() => {});

function ask(options?: PositionOptions) {
  const ok = vi.fn();
  const err = vi.fn();
  nativeGeolocation.getCurrentPosition(ok, err, options);
  return { ok, err };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.native = true;
  mocks.get.mockReset();
  mocks.watch.mockReset();
  mocks.clearWatch.mockReset().mockResolvedValue(undefined);
  resetGeolocationForTests();
});
afterEach(() => vi.useRealTimers());

describe("the two phases", () => {
  it("answers from a quick, low-accuracy, slightly-old fix when there is one", async () => {
    mocks.get.mockResolvedValue(fix());
    const { ok, err } = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get.mock.calls[0][0]).toMatchObject({ enableHighAccuracy: false, timeout: 3000, maximumAge: 60_000 });
    expect(ok.mock.calls[0][0].coords).toMatchObject({ latitude: 18.5, longitude: 73.9 });
  });

  it("falls back to high-accuracy GPS when the quick fix fails", async () => {
    mocks.get.mockRejectedValueOnce(new Error("Location request timed out")).mockResolvedValueOnce(fix(19, 74));
    const { ok } = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get.mock.calls[1][0]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    expect(ok.mock.calls[0][0].coords.latitude).toBe(19);
  });

  it("gives the cold GPS lock a real budget, but never an unbounded one", () => {
    expect(phase2Opts({ timeout: 2000 }).timeout).toBe(6000); // a caller's tiny timeout can't starve the lock
    expect(phase2Opts({ timeout: 8000 }).timeout).toBe(8000);
    expect(phase2Opts({ timeout: 60_000 }).timeout).toBe(12_000);
    expect(phase2Opts().timeout).toBe(10_000);
  });
});

describe("failing fast where waiting cannot help", () => {
  it("reports a refused permission at once, without a second attempt", async () => {
    mocks.get.mockRejectedValue(new Error("User denied location permission"));
    const { ok, err } = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(ok).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0].code).toBe(1);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("reports the phone's Location switch being off at once, as 'unavailable' rather than a timeout", async () => {
    mocks.get.mockRejectedValue(new Error("Location services are not enabled"));
    const { err } = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(err.mock.calls[0][0].code).toBe(2);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});

describe("a plugin that never answers", () => {
  it("still gets the caller an answer, once, within the budget", async () => {
    mocks.get.mockImplementation(never);
    const { ok, err } = ask();
    await vi.advanceTimersByTimeAsync(totalBudgetMs() - 1);
    expect(err).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(ok).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0].code).toBe(3);
  });

  it("does not make the next caller join the dead request", async () => {
    mocks.get.mockImplementationOnce(never);
    const first = ask();
    await vi.advanceTimersByTimeAsync(totalBudgetMs() + 10);
    expect(first.err).toHaveBeenCalledTimes(1);

    mocks.get.mockResolvedValue(fix());
    const second = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.ok).toHaveBeenCalledTimes(1);
  });

  it("never calls back twice, even if the plugin answers after the deadline", async () => {
    let late!: (p: unknown) => void;
    mocks.get.mockImplementation(() => new Promise((r) => { late = r; }));
    const { ok, err } = ask();
    await vi.advanceTimersByTimeAsync(totalBudgetMs() + 10);
    late(fix());
    await vi.advanceTimersByTimeAsync(0);
    expect(err).toHaveBeenCalledTimes(1);
    expect(ok).not.toHaveBeenCalled();
  });

  it("budgets for both phases and a little slack", () => {
    expect(totalBudgetMs()).toBe(3000 + 10_000 + 1500);
    expect(totalBudgetMs({ timeout: 5000 })).toBe(3000 + 6000 + 1500);
  });
});

describe("several callers at once", () => {
  it("share one request instead of queueing their own", async () => {
    mocks.get.mockResolvedValue(fix());
    const a = ask();
    const b = ask();
    const c = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    for (const x of [a, b, c]) expect(x.ok).toHaveBeenCalledTimes(1);
  });

  it("each hear about a failure", async () => {
    mocks.get.mockRejectedValue(new Error("User denied location permission"));
    const a = ask();
    const b = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.err).toHaveBeenCalledTimes(1);
    expect(b.err).toHaveBeenCalledTimes(1);
  });
});

describe("recent fixes", () => {
  it("are reused for a few seconds, then asked for again", async () => {
    mocks.get.mockResolvedValue(fix());
    ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.get).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(FRESH_FIX_MS - 1000);
    const reuse = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(reuse.ok).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("are not kept from a failed attempt", async () => {
    mocks.get.mockRejectedValue(new Error("User denied location permission"));
    ask();
    await vi.advanceTimersByTimeAsync(0);
    mocks.get.mockResolvedValue(fix());
    const retry = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(retry.ok).toHaveBeenCalledTimes(1);
  });
});

describe("in a browser", () => {
  it("uses navigator.geolocation with the same two phases", async () => {
    mocks.native = false;
    const calls: PositionOptions[] = [];
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback, bad: PositionErrorCallback, o: PositionOptions) => {
          calls.push(o);
          if (calls.length === 1) bad({ code: 3, message: "Timeout expired" } as GeolocationPositionError);
          else ok(fix() as unknown as GeolocationPosition);
        },
      },
    });
    const { ok } = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0]).toMatchObject({ enableHighAccuracy: false });
    expect(calls[1]).toMatchObject({ enableHighAccuracy: true });
    expect(ok).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("reports 'unavailable' when the browser has no geolocation at all", async () => {
    mocks.native = false;
    vi.stubGlobal("navigator", {});
    const { err } = ask();
    await vi.advanceTimersByTimeAsync(0);
    expect(err.mock.calls[0][0].code).toBe(2);
    vi.unstubAllGlobals();
  });
});

describe("high accuracy and calibration", () => {
  it("skips coarse PHASE1 and coarse cache when enableHighAccuracy is true", async () => {
    mocks.get.mockResolvedValueOnce(fix(18.1, 73.1, 800));
    ask();
    await vi.advanceTimersByTimeAsync(0);

    mocks.get.mockResolvedValueOnce(fix(18.52, 73.93, 12));
    const { ok } = ask({ enableHighAccuracy: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get.mock.calls[1][0]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    expect(ok.mock.calls[0][0].coords).toMatchObject({ latitude: 18.52, longitude: 73.93 });
  });

  it("picks the sharpest accuracy sample and discards an initial coarse jump", async () => {
    let cb!: (pos: any, err?: any) => void;
    mocks.watch.mockImplementation(async (_opts: unknown, handler: (pos: any, err?: any) => void) => {
      cb = handler;
      return "w1";
    });
    const ok = vi.fn();
    const err = vi.fn();
    nativeGeolocation.getCalibratedPosition(ok, err, { maxDurationMs: 4000, targetAccuracyM: 25 });
    await vi.advanceTimersByTimeAsync(0);

    cb(fix(18.4, 73.8, 1200));
    expect(ok).not.toHaveBeenCalled();

    cb(fix(18.521, 73.931, 45));
    expect(ok).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4000);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
    expect(ok.mock.calls[0][0].coords).toMatchObject({ latitude: 18.521, longitude: 73.931, accuracy: 45 });
  });

  it("resolves immediately when target accuracy (<= 25m) is reached", async () => {
    let cb!: (pos: any, err?: any) => void;
    mocks.watch.mockImplementation(async (_opts: unknown, handler: (pos: any, err?: any) => void) => {
      cb = handler;
      return "w2";
    });
    const ok = vi.fn();
    nativeGeolocation.getCalibratedPosition(ok, null, { maxDurationMs: 4000, targetAccuracyM: 25 });
    await vi.advanceTimersByTimeAsync(0);

    cb(fix(18.525, 73.935, 14));
    expect(ok).toHaveBeenCalledTimes(1);
    expect(ok.mock.calls[0][0].coords).toMatchObject({ latitude: 18.525, longitude: 73.935, accuracy: 14 });
  });
});
