import { describe, expect, it } from "vitest";
import { activeProviderTab } from "./providerNavigation";
import { summarizeProviderActions } from "./providerAppointments";
import type { AppointmentRecord } from "@/types";

const base = "/provider/p_a/manage";

describe("Provider console tabs", () => {
  it.each([
    ["", "home"], ["/", "home"], ["/dashboard", "home"], ["/jobs", "jobs"], ["/find-work", "find-work"],
    ["/leads", "find-work"], ["/money", "money"], ["/profile", "profile"], ["/reviews", "profile"],
    ["/community", "profile"], ["/inbox", "profile"], ["/money-example", undefined],
  ])("maps %s to %s", (path, expected) => {
    expect(activeProviderTab(base, base + path)).toBe(expected);
  });
});

describe("Provider Dashboard actions", () => {
  it("counts Reachouts and payment claims on Dashboard while Jobs only uses pending bookings", () => {
    const items = [
      { id: "old", status: "PENDING", createdAtISO: "2026-11-26T00:00:00Z" },
      { id: "new", status: "PENDING", createdAtISO: "2026-11-27T00:00:00Z" },
      { id: "claim", status: "ACCEPTED", paymentStatus: "PENDING_CONFIRM" },
    ] as AppointmentRecord[];
    const result = summarizeProviderActions(items, 2);
    expect(result.pending.map(({ id }) => id)).toEqual(["new", "old"]);
    expect(result.claims.map(({ id }) => id)).toEqual(["claim"]);
    expect(result.total).toBe(5);
  });
});
