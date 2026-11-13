import type { AppointmentRecord, AppointmentStatus } from "@/types";

/**
 * The appointment state machine as the app needs it: which states are final and which outcome actions the shop has.
 *
 * The server is the authority (`appointment_transition`, 20261015_visit_outcome.sql). This module mirrors its rules so a
 * screen shows exactly the buttons the server will accept, and `appointmentMachine.test.ts` fails if the two drift.
 * Screens should ask here instead of testing status literals (GAPS #46).
 */

/** States no client action can leave (except COMPLETED -> NO_SHOW, a correction the shop may make). */
export const APPOINTMENT_TERMINAL: readonly AppointmentStatus[] = ["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"];

/** The shop may mark a slot booking done from this long before its start (SQL: interval '60 minutes'). */
export const DONE_EARLY_MS = 60 * 60 * 1000;

/** An accepted slot booking nobody marked completes this long after its start (SQL: interval '6 hours'). */
export const AUTO_COMPLETE_AFTER_MS = 6 * 60 * 60 * 1000;

export function isTerminalAppointment(status: AppointmentStatus): boolean {
  return APPOINTMENT_TERMINAL.includes(status);
}

/**
 * The outcome buttons a shop sees for a booking: "Done" and "Didn't show up".
 * Slot bookings only — a delivery order ends with the rider's hand-over or "can't deliver".
 */
export function visitOutcomeActions(
  a: Pick<AppointmentRecord, "status" | "fulfillmentType" | "scheduledForISO">,
  now: number = Date.now(),
): { done: boolean; noShow: boolean } {
  if (a.fulfillmentType === "DELIVERY") return { done: false, noShow: false };
  const start = new Date(a.scheduledForISO).getTime();
  if (Number.isNaN(start)) return { done: false, noShow: false };
  if (a.status === "ACCEPTED") return { done: start - now <= DONE_EARLY_MS, noShow: start <= now };
  if (a.status === "COMPLETED") return { done: false, noShow: true };
  return { done: false, noShow: false };
}

/** Whether the clock has completed this accepted slot booking (used for guest / local records the server never sees). */
export function autoCompletesNow(
  a: Pick<AppointmentRecord, "status" | "fulfillmentType" | "scheduledForISO">,
  now: number = Date.now(),
): boolean {
  return a.status === "ACCEPTED" && a.fulfillmentType !== "DELIVERY"
    && new Date(a.scheduledForISO).getTime() + AUTO_COMPLETE_AFTER_MS <= now;
}
