import type { DeliveryItem } from "@/services/engagement/deliveryService";

/**
 * What a rider should be doing RIGHT NOW for one delivery, in plain words: a headline, one line under it, and which of the four
 * labelled steps (pick up · on the way · arrive · hand over) they are on. Pure, so the card and its tests share it.
 */
export type MissionInput = Pick<DeliveryItem, "status" | "pickedUpAt" | "handoffVerified" | "amountDue" | "cashCollectedAt" | "orderReadyAt" | "isOwnerDelivery">;

export const MISSION_STEPS = ["pickup", "on_way", "arrive", "handover"] as const;

export interface Mission {
  /** Index into MISSION_STEPS being worked on; MISSION_STEPS.length once the delivery is done. */
  step: number;
  emoji: string;
  headlineKey: string;
  subKey: string;
  /** The rider is held up by someone else (the shop has not packed yet). */
  waiting: boolean;
}

export function riderMission(d: MissionInput): Mission {
  if (d.status === "DELIVERED") return { step: MISSION_STEPS.length, emoji: "🎉", headlineKey: "dlv_m_done", subKey: "dlv_m_done_sub", waiting: false };
  if (d.status === "ASSIGNED" && !d.pickedUpAt) {
    // `orderReadyAt === undefined` means the database predates the packed rule, so don't hold the rider back.
    const waiting = d.orderReadyAt === null && !d.isOwnerDelivery;
    return waiting
      ? { step: 0, emoji: "🛍️", headlineKey: "dlv_m_wait_pack", subKey: "dlv_m_wait_pack_sub", waiting: true }
      : { step: 0, emoji: "🏪", headlineKey: "dlv_m_pickup", subKey: "dlv_m_pickup_sub", waiting: false };
  }
  if (d.status === "ASSIGNED") return { step: 1, emoji: "🎒", headlineKey: "dlv_m_start", subKey: "dlv_m_start_sub", waiting: false };
  if (d.status === "EN_ROUTE") return { step: 1, emoji: "🛵", headlineKey: "dlv_m_deliver", subKey: "dlv_m_deliver_sub", waiting: false };
  if (d.status === "ARRIVED" && !d.handoffVerified) return { step: 2, emoji: "🔑", headlineKey: "dlv_m_code", subKey: "dlv_m_code_sub", waiting: false };
  const owes = d.amountDue > 0 && !d.cashCollectedAt;
  return owes
    ? { step: 3, emoji: "💵", headlineKey: "dlv_m_cash", subKey: "dlv_m_cash_sub", waiting: false }
    : { step: 3, emoji: "📦", headlineKey: "dlv_m_handover", subKey: "dlv_m_finish_sub", waiting: false };
}

/** Deliveries a rider finished today (local time), for the "delivered today" counter. */
export function deliveredToday(items: ReadonlyArray<Pick<DeliveryItem, "status" | "deliveredAt">>, now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return items.filter((d) => d.status === "DELIVERED" && d.deliveredAt && new Date(d.deliveredAt).getTime() >= start).length;
}
