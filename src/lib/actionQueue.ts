import { isNetworkError } from "./retry";

/**
 * A small persistent outbox for actions that must not be lost when the connection drops — a rider with no signal in a lift
 * still needs "picked up" and "arrived" to reach the shop once they are back online.
 *
 * It only holds actions that never reached the server (a network failure), keeps them in order, and survives the app being
 * closed. Replay is one at a time, oldest first, because a later step (arrived) is meaningless before an earlier one
 * (on the way). Anything the server *answered* is never retried: a refusal would only repeat itself.
 */

export interface QueuedAction {
  id: string;
  kind: string;
  /** What the action is about (a delivery id) — used to mark that card as waiting and to keep one action's steps in order. */
  subject: string;
  args: Record<string, unknown>;
  queuedAt: number;
}

/** What replaying one action turned out to mean. */
export type Verdict =
  /** Never reached the server (still offline): keep it and stop here, later actions depend on this one. */
  | "retry"
  /** The server says it is already in that state (or no longer applies) — nothing left to do. */
  | "already"
  /** The server refused it for good. Drop it and tell the person. */
  | "failed";

export interface FlushResult {
  sent: number;
  already: number;
  failed: { action: QueuedAction; error: unknown }[];
  /** Replay stopped early because the network was still down. */
  stalled: boolean;
}

export interface ActionQueueOptions {
  /** Storage key; include the user id so a shared device never replays one person's actions as another. */
  key: string;
  run: (action: QueuedAction) => Promise<void>;
  classify?: (error: unknown) => Verdict;
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** Anything queued longer than this is dropped rather than replayed into a situation that has long since changed. */
  maxAgeMs?: number;
  now?: () => number;
}

export interface ActionQueue {
  enqueue(kind: string, subject: string, args?: Record<string, unknown>): QueuedAction | null;
  /** Stable between changes, so it can back useSyncExternalStore. */
  list(): readonly QueuedAction[];
  subjects(): Set<string>;
  flush(): Promise<FlushResult>;
  subscribe(listener: () => void): () => void;
  clear(): void;
}

const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function defaultVerdict(error: unknown): Verdict {
  if (isNetworkError(error)) return "retry";
  const msg = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  return /INVALID_TRANSITION|ALREADY_/i.test(msg) ? "already" : "failed";
}

export function createActionQueue(opts: ActionQueueOptions): ActionQueue {
  const now = opts.now ?? (() => Date.now());
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const classify = opts.classify ?? defaultVerdict;
  const storage = opts.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const listeners = new Set<() => void>();
  let seq = 0;

  function load(): QueuedAction[] {
    try {
      const raw = storage?.getItem(opts.key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (a): a is QueuedAction => !!a && typeof a.id === "string" && typeof a.kind === "string" && typeof a.subject === "string" && typeof a.queuedAt === "number",
      );
    } catch {
      return [];
    }
  }

  let items: readonly QueuedAction[] = load().filter((a) => now() - a.queuedAt <= maxAge);

  function commit(next: readonly QueuedAction[]) {
    items = next;
    try {
      storage?.setItem(opts.key, JSON.stringify(next));
    } catch {
      /* the queue still works for this session; it just won't survive a restart */
    }
    listeners.forEach((l) => l());
  }

  let flushing: Promise<FlushResult> | null = null;

  async function replay(): Promise<FlushResult> {
    const result: FlushResult = { sent: 0, already: 0, failed: [], stalled: false };
    // Expired actions go first, without being run.
    const fresh = items.filter((a) => now() - a.queuedAt <= maxAge);
    for (const stale of items.filter((a) => !fresh.includes(a))) result.failed.push({ action: stale, error: new Error("EXPIRED") });
    if (fresh.length !== items.length) commit(fresh);

    // Snapshot of what to attempt: actions added while replaying wait for the next pass, so order is never reshuffled.
    for (const action of [...items]) {
      try {
        await opts.run(action);
        result.sent++;
      } catch (error) {
        const verdict = classify(error);
        if (verdict === "retry") {
          result.stalled = true;
          return result;
        }
        if (verdict === "already") result.already++;
        else result.failed.push({ action, error });
      }
      commit(items.filter((a) => a.id !== action.id));
    }
    return result;
  }

  return {
    enqueue(kind, subject, args = {}) {
      const sig = JSON.stringify(args);
      // Tapping the same button twice while offline must not send it twice.
      if (items.some((a) => a.kind === kind && a.subject === subject && JSON.stringify(a.args) === sig)) return null;
      const action: QueuedAction = { id: `${now().toString(36)}-${(seq++).toString(36)}`, kind, subject, args, queuedAt: now() };
      commit([...items, action]);
      return action;
    },
    list: () => items,
    subjects: () => new Set(items.map((a) => a.subject)),
    flush() {
      // One replay at a time: online + focus + a timer can all ask at once, and a double replay would send everything twice.
      if (!flushing) flushing = replay().finally(() => { flushing = null; });
      return flushing;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    clear() {
      commit([]);
    },
  };
}
