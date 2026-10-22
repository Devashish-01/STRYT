import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Background location is declared to Google Play for one feature: My People live share. These tests pin the two
 * things a Play reviewer checks in the demo video and on a test device:
 *
 *   1. the persistent notification describes live share — it used to say "for active deliveries", a feature
 *      that is off in v1.0;
 *   2. the in-app disclosure is shown whenever background permission is not actually granted, immediately
 *      before the system dialog — it used to be shown once per install, so a user who denied the dialog was
 *      asked again with nothing in front of it.
 */

const mocks = vi.hoisted(() => ({
  native: true,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn().mockResolvedValue({}),
  start: vi.fn().mockResolvedValue("watcher-1"),
  stop: vi.fn().mockResolvedValue(undefined),
  /** The callback Capgo was started with — call it to simulate the OS delivering a fix. */
  emit: null as null | ((loc: { latitude: number; longitude: number; accuracy: number; bearing: number | null } | null, err?: unknown) => void),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
}));
vi.mock("@capgo/background-geolocation", () => ({
  BackgroundGeolocation: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    start: (opts: unknown, cb: typeof mocks.emit) => {
      mocks.emit = cb;
      return mocks.start(opts, cb);
    },
    stop: mocks.stop,
    openSettings: vi.fn(),
  },
}));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: { watchPosition: vi.fn().mockResolvedValue("cap-1"), clearWatch: vi.fn() },
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
    requestPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
  },
}));

import { backgroundLocation, LIVE_SHARE_NOTICE } from "./backgroundLocation";

beforeEach(() => {
  mocks.native = true;
  mocks.checkPermissions.mockReset();
  mocks.start.mockClear();
  mocks.stop.mockClear();
  mocks.emit = null;
});
// One watcher for the whole process: leave none behind for the next test.
afterEach(async () => {
  await backgroundLocation.stop("live-share");
  await backgroundLocation.stop("delivery");
});

describe("the notification a reviewer sees while sharing", () => {
  it("describes My People live share by default", async () => {
    await backgroundLocation.start(() => {});
    const options = mocks.start.mock.calls[0][0];
    expect(options.backgroundTitle).toBe(LIVE_SHARE_NOTICE.title);
    expect(options.backgroundMessage).toBe(LIVE_SHARE_NOTICE.message);
    expect(options.backgroundMessage).toMatch(/My People/);
  });

  it("never mentions deliveries on the live-share path", async () => {
    await backgroundLocation.start(() => {});
    const options = mocks.start.mock.calls[0][0];
    expect(`${options.backgroundTitle} ${options.backgroundMessage}`).not.toMatch(/deliver/i);
  });

  it("uses a caller's own wording when given one (delivery, off in v1.0)", async () => {
    await backgroundLocation.start(() => {}, { title: "T", message: "M" });
    const options = mocks.start.mock.calls[0][0];
    expect(options.backgroundTitle).toBe("T");
    expect(options.backgroundMessage).toBe("M");
  });
});

const fix = (n: number) => ({ latitude: 18 + n / 1000, longitude: 73, accuracy: 5, bearing: null });

describe("live share and delivery tracking share one watcher", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-20T10:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("starts the native watcher once however many owners join", async () => {
    await backgroundLocation.start(() => {}, undefined, "live-share");
    await backgroundLocation.start(() => {}, LIVE_SHARE_NOTICE, "delivery");
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(backgroundLocation.owners().sort()).toEqual(["delivery", "live-share"]);
  });

  it("hands every owner each fix, with its own throttle", async () => {
    const share = vi.fn();
    const delivery = vi.fn();
    await backgroundLocation.start(share, undefined, "live-share");
    mocks.emit?.(fix(1));
    vi.advanceTimersByTime(5_000);
    await backgroundLocation.start(delivery, LIVE_SHARE_NOTICE, "delivery"); // joins; gets the fresh fix at once
    expect(delivery).toHaveBeenCalledTimes(1);
    mocks.emit?.(fix(2)); // 5s after the share's last push: inside its 12s throttle
    expect(share).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(8_000);
    mocks.emit?.(fix(3));
    expect(share).toHaveBeenCalledTimes(2);
    expect(delivery).toHaveBeenCalledTimes(1); // joined 8s ago: still inside its own throttle
    vi.advanceTimersByTime(5_000);
    mocks.emit?.(fix(4));
    expect(delivery).toHaveBeenCalledTimes(2);
  });

  it("does not hand a joining owner a stale fix", async () => {
    await backgroundLocation.start(() => {}, undefined, "live-share");
    mocks.emit?.(fix(1));
    vi.advanceTimersByTime(60_000);
    const delivery = vi.fn();
    await backgroundLocation.start(delivery, LIVE_SHARE_NOTICE, "delivery");
    expect(delivery).not.toHaveBeenCalled();
  });

  it("ending the delivery leaves the live share running — and the reverse", async () => {
    await backgroundLocation.start(() => {}, undefined, "live-share");
    await backgroundLocation.start(() => {}, LIVE_SHARE_NOTICE, "delivery");
    await backgroundLocation.stop("delivery");
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(backgroundLocation.owners()).toEqual(["live-share"]);
    await backgroundLocation.stop("live-share");
    expect(mocks.stop).toHaveBeenCalledTimes(1); // the last owner out turns it off
    expect(backgroundLocation.owners()).toEqual([]);
  });

  it("a listener that throws cannot starve the other owner", async () => {
    const ok = vi.fn();
    await backgroundLocation.start(() => { throw new Error("boom"); }, undefined, "live-share");
    await backgroundLocation.start(ok, LIVE_SHARE_NOTICE, "delivery");
    mocks.emit?.(fix(1));
    expect(ok).toHaveBeenCalled();
  });

  it("while both run, the notification describes live share — the use declared to Play", async () => {
    const own = { title: "Delivery", message: "Sharing your location for an active delivery" };
    await backgroundLocation.start(() => {}, own, "delivery");
    expect(mocks.start.mock.calls[0][0].backgroundTitle).toBe("Delivery");
    await backgroundLocation.start(() => {}, undefined, "live-share"); // restarts the one watcher with the declared wording
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start.mock.calls[1][0].backgroundTitle).toBe(LIVE_SHARE_NOTICE.title);
    await backgroundLocation.stop("live-share"); // delivery alone again: back to its own wording
    expect(mocks.start).toHaveBeenCalledTimes(3);
    expect(mocks.start.mock.calls[2][0].backgroundTitle).toBe("Delivery");
  });

  it("two starts racing each other still produce one watcher", async () => {
    await Promise.all([backgroundLocation.start(() => {}, undefined, "live-share"), backgroundLocation.start(() => {}, LIVE_SHARE_NOTICE, "delivery")]);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});

describe("whether the prominent disclosure must be shown first", () => {
  it.each([
    ["granted", false],
    ["always", false],
    ["prompt", true],
    ["prompt-with-rationale", true],
    ["denied", true],
    ["when_in_use", true],
  ])("background permission %s -> show disclosure: %s", async (state, expected) => {
    mocks.checkPermissions.mockResolvedValue({ location: "granted", backgroundLocation: state });
    expect(await backgroundLocation.needsBackgroundDisclosure()).toBe(expected);
  });

  it("shows it when the permission cannot be read — the safe direction for a compliance gate", async () => {
    mocks.checkPermissions.mockRejectedValue(new Error("plugin unavailable"));
    expect(await backgroundLocation.needsBackgroundDisclosure()).toBe(true);
  });

  it("shows it again after the user denied the system dialog last time", async () => {
    // First attempt: nothing granted yet.
    mocks.checkPermissions.mockResolvedValueOnce({ backgroundLocation: "prompt" });
    expect(await backgroundLocation.needsBackgroundDisclosure()).toBe(true);
    // They tapped Continue, then denied Android's dialog. Second attempt must show the disclosure again.
    mocks.checkPermissions.mockResolvedValueOnce({ backgroundLocation: "denied" });
    expect(await backgroundLocation.needsBackgroundDisclosure()).toBe(true);
  });

  it("is never needed on the web, which does not ask for background location", async () => {
    mocks.native = false;
    expect(await backgroundLocation.needsBackgroundDisclosure()).toBe(false);
    expect(mocks.checkPermissions).not.toHaveBeenCalled();
  });
});

describe("nothing gates the disclosure on a remembered flag any more", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) && !name.includes(".test.") ? [full] : [];
    });
  }

  it("the old once-per-install localStorage key is gone from src", () => {
    const offenders = sourceFiles("src").filter((f) =>
      readFileSync(f, "utf8").includes("stryt_bg_location_disclosure_v1"),
    );
    expect(offenders).toEqual([]);
  });
});
