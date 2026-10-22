import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createActionQueue, type ActionQueue, type FlushResult, type QueuedAction } from "@/lib/actionQueue";
import { deliveryService, type DeliveryLiveStatus } from "@/services/engagement/deliveryService";

/**
 * The rider's outbox. Pick-up, "on the way", "arrived", and cash taken can be recorded with no signal and are sent when the
 * connection returns. Deliberately not here: verifying the customer's handoff code (the server must answer, it is the proof),
 * and position fixes (an old position is worse than none).
 */
export type RiderActionKind = "pickup" | "status" | "cash";

const queues = new Map<string, ActionQueue>();

/** One queue per signed-in rider, shared by the console (which adds to it) and the app-level runner (which replays it). */
export function riderQueue(userId: string): ActionQueue {
  let q = queues.get(userId);
  if (!q) {
    q = createActionQueue({
      key: `stryt_rider_queue_v1:${userId}`,
      run: runRiderAction,
    });
    queues.set(userId, q);
  }
  return q;
}

async function runRiderAction(a: QueuedAction): Promise<void> {
  switch (a.kind as RiderActionKind) {
    case "pickup":
      await deliveryService.markPickedUp(a.subject);
      return;
    case "status":
      await deliveryService.updateStatus(a.subject, a.args.next as DeliveryLiveStatus, a.args.lat as number | undefined, a.args.lng as number | undefined);
      return;
    case "cash":
      await deliveryService.collectCash(a.subject);
      return;
    default:
      throw new Error(`UNKNOWN_ACTION:${a.kind}`);
  }
}

export interface RiderQueueView {
  pending: readonly QueuedAction[];
  /** Deliveries with an action still waiting to be sent — their cards are held until it goes. */
  waiting: Set<string>;
  enqueue: (kind: RiderActionKind, deliveryId: string, args?: Record<string, unknown>) => void;
  flush: () => Promise<FlushResult>;
}

export function useRiderQueue(userId: string): RiderQueueView {
  const q = riderQueue(userId);
  const pending = useSyncExternalStore(q.subscribe, q.list, q.list);
  const waiting = useMemo(() => new Set(pending.map((a) => a.subject)), [pending]);
  const enqueue = useCallback((kind: RiderActionKind, deliveryId: string, args?: Record<string, unknown>) => {
    q.enqueue(kind, deliveryId, args);
  }, [q]);
  const flush = useCallback(() => q.flush(), [q]);
  return { pending, waiting, enqueue, flush };
}

/** Test seam. */
export function resetRiderQueuesForTests() {
  queues.clear();
}
