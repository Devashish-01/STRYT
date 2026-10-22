import { describe, expect, it, vi } from "vitest";
import { createActionQueue, defaultVerdict, type QueuedAction } from "./actionQueue";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}
const offline = () => new Error("Failed to fetch");

function make(run: (a: QueuedAction) => Promise<void>, extra: Partial<Parameters<typeof createActionQueue>[0]> = {}) {
  const storage = memoryStorage();
  const queue = createActionQueue({ key: "q:u1", run, storage, ...extra });
  return { queue, storage };
}

describe("enqueue", () => {
  it("keeps actions in the order they were taken", () => {
    const { queue } = make(async () => {});
    queue.enqueue("pickup", "d1");
    queue.enqueue("status", "d1", { next: "ON_THE_WAY" });
    queue.enqueue("status", "d1", { next: "ARRIVED" });
    expect(queue.list().map((a) => a.kind + ":" + (a.args.next ?? ""))).toEqual(["pickup:", "status:ON_THE_WAY", "status:ARRIVED"]);
  });

  it("ignores the same tap twice", () => {
    const { queue } = make(async () => {});
    expect(queue.enqueue("pickup", "d1")).not.toBeNull();
    expect(queue.enqueue("pickup", "d1")).toBeNull();
    expect(queue.list()).toHaveLength(1);
    // a different step on the same delivery is a different action
    expect(queue.enqueue("status", "d1", { next: "ARRIVED" })).not.toBeNull();
  });

  it("knows which deliveries are waiting", () => {
    const { queue } = make(async () => {});
    queue.enqueue("pickup", "d1");
    queue.enqueue("cash", "d2");
    expect([...queue.subjects()].sort()).toEqual(["d1", "d2"]);
  });

  it("hands out a new list only when something changed, so React re-renders exactly then", () => {
    const { queue } = make(async () => {});
    const a = queue.list();
    expect(queue.list()).toBe(a);
    queue.enqueue("pickup", "d1");
    expect(queue.list()).not.toBe(a);
  });
});

describe("persistence", () => {
  it("survives the app being closed and reopened", () => {
    const { queue, storage } = make(async () => {});
    queue.enqueue("pickup", "d1");
    const reopened = createActionQueue({ key: "q:u1", run: async () => {}, storage });
    expect(reopened.list().map((a) => a.subject)).toEqual(["d1"]);
  });

  it("does not leak between people on a shared device", () => {
    const { queue, storage } = make(async () => {});
    queue.enqueue("pickup", "d1");
    expect(createActionQueue({ key: "q:u2", run: async () => {}, storage }).list()).toEqual([]);
  });

  it("starts empty rather than crashing on a corrupt store", () => {
    const storage = memoryStorage({ "q:u1": "{not json" });
    expect(createActionQueue({ key: "q:u1", run: async () => {}, storage }).list()).toEqual([]);
  });

  it("still works when storage refuses writes", () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    const queue = createActionQueue({ key: "k", run: async () => {}, storage });
    expect(() => queue.enqueue("pickup", "d1")).not.toThrow();
    expect(queue.list()).toHaveLength(1);
  });

  it("drops what is too old to be true any more", () => {
    let t = 1_000_000;
    const storage = memoryStorage();
    const a = createActionQueue({ key: "k", run: async () => {}, storage, now: () => t });
    a.enqueue("pickup", "d1");
    t += 13 * 60 * 60 * 1000;
    expect(createActionQueue({ key: "k", run: async () => {}, storage, now: () => t }).list()).toEqual([]);
  });
});

describe("flush", () => {
  it("sends everything oldest first and empties the queue", async () => {
    const seen: string[] = [];
    const { queue } = make(async (a) => { seen.push(`${a.kind}:${a.subject}`); });
    queue.enqueue("pickup", "d1");
    queue.enqueue("status", "d1", { next: "ON_THE_WAY" });
    const r = await queue.flush();
    expect(seen).toEqual(["pickup:d1", "status:d1"]);
    expect(r).toMatchObject({ sent: 2, already: 0, failed: [], stalled: false });
    expect(queue.list()).toEqual([]);
  });

  it("stops at the first network failure and keeps that action and everything after it", async () => {
    const run = vi.fn<(a: QueuedAction) => Promise<void>>().mockResolvedValueOnce(undefined).mockRejectedValueOnce(offline());
    const { queue } = make(run);
    queue.enqueue("pickup", "d1");
    queue.enqueue("status", "d1", { next: "ON_THE_WAY" });
    queue.enqueue("status", "d1", { next: "ARRIVED" });
    const r = await queue.flush();
    expect(r.stalled).toBe(true);
    expect(r.sent).toBe(1);
    expect(queue.list().map((a) => a.args.next)).toEqual(["ON_THE_WAY", "ARRIVED"]); // order preserved for the next try
    expect(run).toHaveBeenCalledTimes(2); // never tried the third while the second could not go
  });

  it("treats 'already in that state' as done", async () => {
    const { queue } = make(async () => { throw new Error("INVALID_TRANSITION"); });
    queue.enqueue("status", "d1", { next: "ON_THE_WAY" });
    const r = await queue.flush();
    expect(r).toMatchObject({ sent: 0, already: 1, failed: [] });
    expect(queue.list()).toEqual([]);
  });

  it("drops a refused action, reports it, and carries on with the rest", async () => {
    const run = vi.fn<(a: QueuedAction) => Promise<void>>().mockRejectedValueOnce(new Error("ORDER_NOT_ACTIVE")).mockResolvedValueOnce(undefined);
    const { queue } = make(run);
    queue.enqueue("pickup", "d1");
    queue.enqueue("pickup", "d2");
    const r = await queue.flush();
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].action.subject).toBe("d1");
    expect(r.sent).toBe(1);
    expect(queue.list()).toEqual([]);
  });

  it("never replays twice when asked twice at once (online + focus + timer)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const run = vi.fn(async () => { await gate; });
    const { queue } = make(run);
    queue.enqueue("pickup", "d1");
    const first = queue.flush();
    const second = queue.flush();
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("an action added mid-replay waits for the next pass", async () => {
    const holder: { queue?: ReturnType<typeof make>["queue"] } = {};
    const run = vi.fn(async (a: QueuedAction) => { if (a.subject === "d1") holder.queue?.enqueue("pickup", "d2"); });
    const { queue } = make(run);
    holder.queue = queue;
    queue.enqueue("pickup", "d1");
    await queue.flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(queue.list().map((a) => a.subject)).toEqual(["d2"]);
  });

  it("tells subscribers as the queue drains", async () => {
    const { queue } = make(async () => {});
    queue.enqueue("pickup", "d1");
    const seen = vi.fn();
    queue.subscribe(seen);
    await queue.flush();
    expect(seen).toHaveBeenCalled();
  });
});

describe("defaultVerdict", () => {
  it("separates 'never arrived' from 'the server said no'", () => {
    expect(defaultVerdict(new Error("Failed to fetch"))).toBe("retry");
    expect(defaultVerdict(new Error("INVALID_TRANSITION"))).toBe("already");
    expect(defaultVerdict({ message: "ORDER_NOT_ACTIVE" })).toBe("failed");
    expect(defaultVerdict(new Error("NOT_AGENT"))).toBe("failed");
  });
});
