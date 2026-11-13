import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUTO_COMPLETE_AFTER_MS, DONE_EARLY_MS, autoCompletesNow, isTerminalAppointment, visitOutcomeActions } from "./appointment";

const NOW = Date.parse("2026-11-13T10:00:00Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();
const H = 60 * 60 * 1000;
const slot = (status: "ACCEPTED" | "COMPLETED" | "PENDING" | "NO_SHOW", startIn: number) =>
  ({ status, fulfillmentType: "IN_STORE" as const, scheduledForISO: at(startIn) });

describe("visitOutcomeActions", () => {
  it("offers Done from an hour before the slot, and No-show once it has started", () => {
    expect(visitOutcomeActions(slot("ACCEPTED", 2 * H), NOW)).toEqual({ done: false, noShow: false });
    expect(visitOutcomeActions(slot("ACCEPTED", 30 * 60 * 1000), NOW)).toEqual({ done: true, noShow: false });
    expect(visitOutcomeActions(slot("ACCEPTED", -H), NOW)).toEqual({ done: true, noShow: true });
  });

  it("lets the shop correct an automatic completion to a no-show", () => {
    expect(visitOutcomeActions(slot("COMPLETED", -8 * H), NOW)).toEqual({ done: false, noShow: true });
  });

  it("offers nothing on a delivery order, a pending request or a closed booking", () => {
    expect(visitOutcomeActions({ ...slot("ACCEPTED", -H), fulfillmentType: "DELIVERY" }, NOW)).toEqual({ done: false, noShow: false });
    expect(visitOutcomeActions(slot("PENDING", -H), NOW)).toEqual({ done: false, noShow: false });
    expect(visitOutcomeActions(slot("NO_SHOW", -H), NOW)).toEqual({ done: false, noShow: false });
  });
});

describe("autoCompletesNow", () => {
  it("completes an untouched slot booking only after the grace period", () => {
    expect(autoCompletesNow(slot("ACCEPTED", -H), NOW)).toBe(false);
    expect(autoCompletesNow(slot("ACCEPTED", -7 * H), NOW)).toBe(true);
    expect(autoCompletesNow({ ...slot("ACCEPTED", -7 * H), fulfillmentType: "DELIVERY" }, NOW)).toBe(false);
  });
});

describe("terminal states", () => {
  it("are the four the server never moves on from", () => {
    expect(["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"].every((s) => isTerminalAppointment(s as never))).toBe(true);
    expect(isTerminalAppointment("ACCEPTED")).toBe(false);
  });
});

describe("matches the server (20261015_visit_outcome.sql)", () => {
  const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/20261015_visit_outcome.sql"), "utf8");

  it("uses the same 'Done' window and auto-complete grace", () => {
    expect(DONE_EARLY_MS).toBe(60 * 60 * 1000);
    expect(sql).toContain("scheduled_for > now() + interval '60 minutes'");
    expect(AUTO_COMPLETE_AFTER_MS).toBe(6 * H);
    expect(sql.match(/scheduled_for <= now\(\) - interval '6 hours'/g)?.length).toBe(2);
  });

  it("has the shop edges this module offers, and none for the customer", () => {
    expect(sql).toMatch(/v_is_manager and v_is_slot and v_appointment\.status = 'ACCEPTED' and p_status = 'COMPLETED'/);
    expect(sql).toMatch(/v_is_manager and v_is_slot and v_appointment\.status = 'ACCEPTED' and p_status = 'NO_SHOW'/);
    expect(sql).toMatch(/v_is_manager and v_is_slot and v_appointment\.status = 'COMPLETED' and p_status = 'NO_SHOW'/);
    expect(sql).not.toMatch(/v_is_customer[^;]*p_status = 'COMPLETED'/);
  });
});
