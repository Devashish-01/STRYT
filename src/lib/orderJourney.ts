import { ORDER_STAGES, type OrderStage } from "@/lib/deliveryStage";
import type { AppointmentRecord } from "@/types";
import type { AppointmentDelivery } from "@/services/engagement/deliveryService";

/**
 * What the customer's tracker shows for a home-delivery order, derived from the stage the order is in.
 * Pure: the card, the owner's order card and the tests all use it. Nothing here reads or exposes a location — the moving rider on the
 * shop-to-home strip is positioned from the stage and the server's "minutes away", never from coordinates.
 */

/** The five milestones a person follows; the seven stages in ORDER_STAGES fold into these. */
export const MILESTONES = ["placed", "packing", "rider", "on_the_way", "delivered"] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Index into MILESTONES for a stage index from orderStageIndex(), or -1 when the order ended without being delivered. */
export function milestoneIndex(stageIdx: number): number {
  if (stageIdx < 0) return -1;
  switch (ORDER_STAGES[stageIdx]) {
    case "placed": return 0;
    case "accepted":
    case "packed": return 1;
    case "assigned":
    case "picked_up": return 2;
    case "on_the_way": return 3;
    default: return 4;
  }
}

export interface StageCopy {
  emoji: string;
  /** i18n keys for the big line and the line under it. */
  headlineKey: string;
  subKey: string;
}

/** The friendly words and picture for a stage. `arrived` is the last part of "on the way": the rider is at the door. */
export function stageCopy(stage: OrderStage, arrived = false): StageCopy {
  if (stage === "on_the_way" && arrived) return { emoji: "📍", headlineKey: "trk_h_arrived", subKey: "trk_s_arrived" };
  switch (stage) {
    case "placed": return { emoji: "🧾", headlineKey: "trk_h_placed", subKey: "trk_s_placed" };
    case "accepted": return { emoji: "🧑‍🍳", headlineKey: "trk_h_accepted", subKey: "trk_s_accepted" };
    case "packed": return { emoji: "🛍️", headlineKey: "trk_h_packed", subKey: "trk_s_packed" };
    case "assigned": return { emoji: "🛵", headlineKey: "trk_h_assigned", subKey: "trk_s_assigned" };
    case "picked_up": return { emoji: "🎒", headlineKey: "trk_h_picked_up", subKey: "trk_s_picked_up" };
    case "on_the_way": return { emoji: "🚀", headlineKey: "trk_h_on_the_way", subKey: "trk_s_on_the_way" };
    default: return { emoji: "🎉", headlineKey: "trk_h_delivered", subKey: "trk_s_delivered" };
  }
}

const BASE_FRACTION: Record<OrderStage, number> = {
  placed: 0.04,
  accepted: 0.1,
  packed: 0.18,
  assigned: 0.26,
  picked_up: 0.34,
  on_the_way: 0.5,
  delivered: 1,
};

/**
 * How far along the shop-to-home strip the rider is, 0..1. Before the rider sets off it follows the stage; on the way it follows the
 * server's "minutes away" against the longest value seen for this delivery, so the scooter glides closer as the number falls.
 */
export function journeyFraction(stage: OrderStage, arrived: boolean, etaMinutes: number | null | undefined, startEtaMinutes: number | null | undefined): number {
  if (stage !== "on_the_way") return BASE_FRACTION[stage];
  if (arrived) return 0.96;
  if (etaMinutes == null || !startEtaMinutes || startEtaMinutes <= 0) return BASE_FRACTION.on_the_way;
  const left = Math.min(1, Math.max(0, etaMinutes / startEtaMinutes));
  return Math.min(0.94, Math.max(0.38, 0.38 + (1 - left) * 0.56));
}

/** "Arriving now" under a minute, otherwise whole minutes. Null when there is no number to show. */
export function etaDisplay(etaMinutes: number | null | undefined): { kind: "now" } | { kind: "min"; n: number } | null {
  if (etaMinutes == null || !Number.isFinite(etaMinutes)) return null;
  if (etaMinutes < 1) return { kind: "now" };
  return { kind: "min", n: Math.round(etaMinutes) };
}

/** The one sentence that says what the shop should do next (or what is happening), for a home-delivery order. */
export function ownerNextStepKey(
  apt: Pick<AppointmentRecord, "status" | "readyAt">,
  delivery: Pick<AppointmentDelivery, "status"> | null | undefined,
): string | null {
  if (apt.status === "PENDING") return "own_hint_new";
  if (apt.status === "COMPLETED" || delivery?.status === "DELIVERED") return "own_hint_done";
  if (apt.status !== "ACCEPTED") return null;
  if (delivery?.status === "ASSIGNED") return "own_hint_assigned";
  if (delivery?.status === "EN_ROUTE") return "own_hint_en_route";
  if (delivery?.status === "ARRIVED") return "own_hint_arrived";
  return apt.readyAt ? "own_hint_assign" : "own_hint_pack";
}
