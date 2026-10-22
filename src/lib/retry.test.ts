import { describe, expect, it, vi } from "vitest";
import { isNetworkError, withRetry } from "./retry";

const noSleep = () => Promise.resolve();

describe("isNetworkError", () => {
  it("recognises requests that never reached the server", () => {
    for (const m of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Network request failed", "Load failed", "request timed out"]) {
      expect(isNetworkError(new Error(m)), m).toBe(true);
    }
  });
  it("does not mistake a server refusal for a network problem", () => {
    for (const m of ["ORDER_NOT_ACTIVE", "INVALID_TRANSITION", "NOT_AGENT", "HANDOFF_NOT_VERIFIED"]) {
      expect(isNetworkError(new Error(m)), m).toBe(false);
    }
    expect(isNetworkError({ message: "NOT_ALLOWED" })).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns at once when the first attempt works", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a network failure and returns the later success", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("Failed to fetch")).mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValue("ok");
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last attempt and throws the network error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow("Failed to fetch");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("never retries a server-side refusal — repeating it would only repeat the refusal", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ORDER_NOT_ACTIVE"));
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow("ORDER_NOT_ACTIVE");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("pauses a little longer after each failure", async () => {
    const sleeps: number[] = [];
    const fn = vi.fn().mockRejectedValueOnce(new Error("Failed to fetch")).mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValue(1);
    await withRetry(fn, { attempts: 3, baseMs: 100, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });
    expect(sleeps).toEqual([100, 200]);
  });
});
