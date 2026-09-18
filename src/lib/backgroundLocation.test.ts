import { describe, it, expect, vi, beforeEach } from "vitest";
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
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
}));
vi.mock("@capgo/background-geolocation", () => ({
  BackgroundGeolocation: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    start: mocks.start,
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
