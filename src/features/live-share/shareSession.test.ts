import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * P15-003. A share ends at live_shares.expires_at, but the server records that only on the next start, so the
 * app must enforce it. Before this, an expired share kept collecting background location under a "sharing"
 * notification while contacts saw it as ended — and every launch resumed it. Production had exactly that on
 * 18 Sept 2026: one ACTIVE share, expired.
 */

type Fix = { lat: number; lng: number; accuracy?: number; heading?: number };

const mocks = vi.hoisted(() => ({
  onFix: null as ((f: Fix) => void) | null,
  mode: "background" as "background" | "foreground" | "web",
  myActiveShare: vi.fn(),
  stopShare: vi.fn(),
  updateShare: vi.fn(),
  bgStart: vi.fn(),
  bgStop: vi.fn(),
}));

vi.mock("@/services", () => ({
  emergencyService: {
    myActiveShare: mocks.myActiveShare,
    stopShare: mocks.stopShare,
    updateShare: mocks.updateShare,
  },
}));
vi.mock("@/lib/backgroundLocation", () => ({
  backgroundLocation: { start: mocks.bgStart, stop: mocks.bgStop },
}));

import { msUntilExpiry, shareToResume, watchShare, assumedExpiry } from "./shareSession";

const NOW = Date.parse("2026-09-18T10:00:00Z");
const inMs = (ms: number) => new Date(NOW + ms).toISOString();
const HOUR = 3600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.onFix = null;
  mocks.mode = "background";
  mocks.myActiveShare.mockReset();
  mocks.stopShare.mockReset().mockResolvedValue(undefined);
  mocks.updateShare.mockReset().mockResolvedValue(undefined);
  mocks.bgStart.mockReset().mockImplementation((cb: (f: Fix) => void) => {
    mocks.onFix = cb;
    return Promise.resolve(mocks.mode);
  });
  mocks.bgStop.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("msUntilExpiry", () => {
  it("counts down to the expiry", () => {
    expect(msUntilExpiry(inMs(90_000), NOW)).toBe(90_000);
  });

  it.each([
    ["already passed", inMs(-1)],
    ["exactly now", inMs(0)],
    ["missing", null],
    ["empty", ""],
    ["unreadable", "not a date"],
  ])("is 0 when the expiry is %s — never a reason to keep collecting", (_label, value) => {
    expect(msUntilExpiry(value, NOW)).toBe(0);
  });

  it("assumes the column default when the real expiry cannot be read back", () => {
    expect(msUntilExpiry(assumedExpiry(NOW), NOW)).toBe(8 * HOUR);
  });
});

describe("on launch: which share to resume", () => {
  it("resumes a share that has not expired", async () => {
    mocks.myActiveShare.mockResolvedValue({ id: "ls_1", expiresAt: inMs(2 * HOUR) });
    expect(await shareToResume()).toEqual({ id: "ls_1", expiresAt: inMs(2 * HOUR) });
    expect(mocks.stopShare).not.toHaveBeenCalled();
  });

  it("does not resume an expired share, and ends it on the server instead", async () => {
    mocks.myActiveShare.mockResolvedValue({ id: "ls_1", expiresAt: inMs(-3 * 24 * HOUR) });
    expect(await shareToResume()).toBeNull();
    expect(mocks.stopShare).toHaveBeenCalledTimes(1);
  });

  it("still does not resume it when ending it on the server fails", async () => {
    mocks.myActiveShare.mockResolvedValue({ id: "ls_1", expiresAt: inMs(-HOUR) });
    mocks.stopShare.mockRejectedValue(new Error("offline"));
    expect(await shareToResume()).toBeNull();
  });

  it("resumes nothing when there is no share", async () => {
    mocks.myActiveShare.mockResolvedValue(null);
    expect(await shareToResume()).toBeNull();
    expect(mocks.stopShare).not.toHaveBeenCalled();
  });
});

describe("while sharing", () => {
  it("collects nothing for a share that has already expired", () => {
    const onExpired = vi.fn();
    expect(watchShare(inMs(-1), { onExpired })).toBeNull();
    expect(mocks.bgStart).not.toHaveBeenCalled();
  });

  it("sends each fix to the share before it expires", () => {
    watchShare(inMs(HOUR), { onExpired: vi.fn() });
    mocks.onFix!({ lat: 19.07, lng: 72.87, accuracy: 5, heading: 90 });
    expect(mocks.updateShare).toHaveBeenCalledWith(19.07, 72.87, 5, 90);
  });

  it("skips a 0,0 fix rather than broadcasting the middle of the ocean", () => {
    watchShare(inMs(HOUR), { onExpired: vi.fn() });
    mocks.onFix!({ lat: 0, lng: 0 });
    expect(mocks.updateShare).not.toHaveBeenCalled();
  });

  it("stops at expiry on the next fix, even if no timer ran (a backgrounded WebView)", () => {
    const onExpired = vi.fn();
    watchShare(inMs(HOUR), { onExpired });
    vi.setSystemTime(NOW + HOUR); // time passes; timers do not fire
    mocks.onFix!({ lat: 19.07, lng: 72.87 });
    expect(mocks.updateShare).not.toHaveBeenCalled();
    expect(mocks.bgStop).toHaveBeenCalledTimes(1);
    expect(mocks.stopShare).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("stops at expiry by timer when no fix arrives", () => {
    const onExpired = vi.fn();
    watchShare(inMs(HOUR), { onExpired });
    vi.advanceTimersByTime(HOUR - 1);
    expect(onExpired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.bgStop).toHaveBeenCalledTimes(1);
    expect(mocks.stopShare).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("expires once, however many fixes arrive after it", () => {
    const onExpired = vi.fn();
    watchShare(inMs(HOUR), { onExpired });
    vi.setSystemTime(NOW + HOUR);
    mocks.onFix!({ lat: 19.07, lng: 72.87 });
    mocks.onFix!({ lat: 19.08, lng: 72.88 });
    vi.advanceTimersByTime(HOUR);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(mocks.stopShare).toHaveBeenCalledTimes(1);
    expect(mocks.updateShare).not.toHaveBeenCalled();
  });

  it("after the user stops, neither a late fix nor the timer does anything", () => {
    const onExpired = vi.fn();
    const w = watchShare(inMs(HOUR), { onExpired })!;
    w.stop();
    w.stop();
    mocks.onFix!({ lat: 19.07, lng: 72.87 });
    vi.advanceTimersByTime(2 * HOUR);
    expect(mocks.bgStop).toHaveBeenCalledTimes(1);
    expect(mocks.updateShare).not.toHaveBeenCalled();
    expect(mocks.stopShare).not.toHaveBeenCalled(); // the caller ends the share when the user stops
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("tells the caller when only foreground updates are possible", async () => {
    mocks.mode = "foreground";
    const onForegroundOnly = vi.fn();
    watchShare(inMs(HOUR), { onExpired: vi.fn(), onForegroundOnly });
    await vi.advanceTimersByTimeAsync(0);
    expect(onForegroundOnly).toHaveBeenCalledTimes(1);
  });

  it("a failed update is swallowed, not an unhandled rejection", async () => {
    mocks.updateShare.mockRejectedValue(new Error("offline"));
    watchShare(inMs(HOUR), { onExpired: vi.fn() });
    mocks.onFix!({ lat: 19.07, lng: 72.87 });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.updateShare).toHaveBeenCalledTimes(1);
  });
});

describe("the provider uses this lifecycle", () => {
  // The provider cannot be rendered in this node test environment, so pin the wiring instead: expiry is only
  // enforced if the provider goes through shareToResume/watchShare rather than starting the plugin itself.
  it("resumes through shareToResume and collects through watchShare", async () => {
    const { readFileSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
    const src = readFileSync("src/features/live-share/LiveShareProvider.tsx", "utf8");
    expect(src).toMatch(/shareToResume\(\)/);
    expect(src).toMatch(/watchShare\(/);
    expect(src).not.toMatch(/backgroundLocation\.start\(/);
    expect(src).not.toMatch(/myActiveShareId/);
  });
});
