import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSION } from "./legal";
import { beginLoginAcceptance, cancelLoginAcceptance, completeLoginAcceptance, restoreLoginAcceptance, waitForLoginAcceptance } from "./loginAcceptance";

const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("./supabaseClient", () => ({ getSupabase: () => ({ rpc }) }));
const key = "stryt_google_acceptance_attempt";
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.stubGlobal("navigator", { userAgent: "onboarding-test" });
  rpc.mockReset().mockReturnValue({ abortSignal });
  abortSignal.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => { cancelLoginAcceptance(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Google button acceptance", () => {
  it("does not record consent for a restored or silently refreshed session", async () => {
    await completeLoginAcceptance();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("waits for the audit save before releasing profile hydration", async () => {
    let finish!: (value: { error: null }) => void;
    abortSignal.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    beginLoginAcceptance();
    const attempt = JSON.parse(storage.get(key)!);
    let released = false;
    void waitForLoginAcceptance().then(() => { released = true; });
    const saving = completeLoginAcceptance();
    await Promise.resolve();
    expect(released).toBe(false);
    expect(rpc).toHaveBeenCalledWith("record_login_acceptance", {
      p_version: LEGAL_VERSION, p_attempt_id: attempt.id, p_user_agent: "onboarding-test",
    });
    finish({ error: null });
    await saving;
    await waitForLoginAcceptance();
    expect(released).toBe(true);
    expect(storage.has(key)).toBe(false);
  });
  it("cancellation discards the attempt and releases waiters without recording", async () => {
    beginLoginAcceptance();
    const waiting = waitForLoginAcceptance();
    cancelLoginAcceptance();
    await waiting;
    await completeLoginAcceptance();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("failed writes release routing to the existing Terms fallback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    abortSignal.mockResolvedValue({ error: { message: "offline" } });
    beginLoginAcceptance();
    await completeLoginAcceptance();
    await waitForLoginAcceptance();
    expect(storage.has(key)).toBe(false);
  });
  it("restores the same attempt id across the actual redirect", async () => {
    beginLoginAcceptance();
    const serialized = storage.get(key)!;
    cancelLoginAcceptance();
    storage.set(key, serialized);
    restoreLoginAcceptance();
    await completeLoginAcceptance();
    expect(rpc.mock.calls[0][1].p_attempt_id).toBe(JSON.parse(serialized).id);
  });
  it.each(["expired", "future", "different-version", "malformed"])("ignores %s redirect markers", async kind => {
    storage.set(key, kind === "malformed" ? "{" : JSON.stringify({
      id: crypto.randomUUID(), version: kind === "different-version" ? "old" : LEGAL_VERSION,
      startedAt: Date.now() + (kind === "future" ? 60_000 : -16 * 60_000),
    }));
    restoreLoginAcceptance();
    await completeLoginAcceptance();
    await waitForLoginAcceptance();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not clear a newer attempt when an older request finishes", async () => {
    let finish!: (value: { error: null }) => void;
    abortSignal.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    beginLoginAcceptance();
    const saving = completeLoginAcceptance();
    beginLoginAcceptance();
    const newer = storage.get(key);
    finish({ error: null });
    await saving;
    expect(storage.get(key)).toBe(newer);
    await completeLoginAcceptance();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
