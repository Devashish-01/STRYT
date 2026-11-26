import { describe, expect, it } from "vitest";
import { countBusinessActions } from "./businessConsoleData";

const allActions = { bookings: 2, appointmentClaims: 3, customClaims: 4, queueClaims: 7, questions: 11, bulkClaims: 13 };

describe("the Dashboard badge", () => {
  it("counts the action sources this staff member can work on", () => {
    expect(countBusinessActions(allActions, { appointments: false, queue: true, leads: false, catalog: false })).toBe(7);
    expect(countBusinessActions(allActions, { appointments: false, queue: false, leads: true, catalog: true })).toBe(24);
    expect(countBusinessActions(allActions, { appointments: true, queue: true, leads: true, catalog: true })).toBe(40);
    expect(countBusinessActions(allActions, { appointments: false, queue: false, leads: false, catalog: false })).toBe(0);
  });
});
