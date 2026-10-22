import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTrackingState, lastKnownFix, recordFix, resetTrackingForTests, setTrackingState, subscribeTracking } from "./trackingStore";

beforeEach(() => resetTrackingForTests());
afterEach(() => vi.useRealTimers());

describe("tracking state", () => {
  it("starts idle with nothing recorded", () => {
    expect(getTrackingState()).toEqual({ status: "idle", lastFixAt: null, consoleOpen: false });
  });

  it("publishes a change to subscribers, with a new object so React notices", () => {
    const before = getTrackingState();
    const seen = vi.fn();
    const off = subscribeTracking(seen);
    setTrackingState({ status: "declined" });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getTrackingState()).not.toBe(before);
    expect(getTrackingState().status).toBe("declined");
    off();
    setTrackingState({ status: "on" });
    expect(seen).toHaveBeenCalledTimes(1); // unsubscribed
  });

  it("does not notify when nothing actually changed", () => {
    setTrackingState({ status: "on", lastFixAt: 5 });
    const seen = vi.fn();
    subscribeTracking(seen);
    setTrackingState({ status: "on", lastFixAt: 5 });
    expect(seen).not.toHaveBeenCalled();
  });

  it("tracks whether the rider console is open, separately from the status", () => {
    setTrackingState({ consoleOpen: true });
    expect(getTrackingState().consoleOpen).toBe(true);
    expect(getTrackingState().status).toBe("idle");
  });
});

describe("last known position", () => {
  it("is null until a fix is recorded", () => {
    expect(lastKnownFix()).toBeNull();
  });

  it("returns a recent fix, so a status tap is not held up waiting for a fresh GPS read", () => {
    recordFix({ lat: 18.57, lng: 73.91 });
    expect(lastKnownFix(60_000)).toEqual({ lat: 18.57, lng: 73.91 });
  });

  it("refuses a fix that has gone stale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    recordFix({ lat: 1, lng: 2 });
    vi.setSystemTime(new Date("2026-10-19T12:02:00Z")); // two minutes later
    expect(lastKnownFix(45_000)).toBeNull();
    expect(lastKnownFix(5 * 60_000)).toEqual({ lat: 1, lng: 2 });
  });
});
