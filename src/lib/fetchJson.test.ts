import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FetchTimeoutError, fetchJson, withDeadline } from "./fetchJson";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** A fetch that never answers until its signal aborts, like a stalled mobile connection. */
const stalledFetch = () =>
  vi.fn((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
    init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
  }));

describe("fetchJson", () => {
  it("returns the parsed body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ a: 1 }) }));
    await expect(fetchJson("https://x", 1000)).resolves.toEqual({ ok: true, status: 200, data: { a: 1 } });
  });

  it("reports an HTTP error without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    await expect(fetchJson("https://x", 1000)).resolves.toEqual({ ok: false, status: 429, data: null });
  });

  it("gives up on a request that never answers, with an error that says so", async () => {
    vi.stubGlobal("fetch", stalledFetch());
    const pending = fetchJson("https://x", 4000);
    const assertion = expect(pending).rejects.toBeInstanceOf(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(4001);
    await assertion;
  });

  it("also covers a body that stalls after the headers arrived", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))),
    })));
    const assertion = expect(fetchJson("https://x", 3000)).rejects.toBeInstanceOf(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(3001);
    await assertion;
  });

  it("passes a real network failure through untouched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchJson("https://x", 1000)).rejects.toThrow("Failed to fetch");
  });
});

describe("withDeadline", () => {
  it("returns the value when the work finishes in time", async () => {
    await expect(withDeadline(Promise.resolve("area"), 1000, null)).resolves.toBe("area");
  });

  it("returns the fallback when it doesn't — and lets the work carry on", async () => {
    let finish!: (v: string) => void;
    const work = new Promise<string>((r) => { finish = r; });
    const raced = withDeadline(work, 500, null);
    await vi.advanceTimersByTimeAsync(501);
    await expect(raced).resolves.toBeNull();
    finish("late"); // does not throw, does not resurrect the answer
    await expect(work).resolves.toBe("late");
  });

  it("treats a failure as 'no answer' rather than an error", async () => {
    await expect(withDeadline(Promise.reject(new Error("boom")), 1000, "none")).resolves.toBe("none");
  });
});
