import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { liveStatusToDeliveryStatus } from "./deliveryStatus";

/**
 * A delivery carries one state in two columns: `live_status` (what the rider pushes) and `status` (the lifecycle). The server
 * maps one to the other in appointment_update_delivery_status; this file maps it again for surfaces that only see live_status.
 * GAPS #46: pin the two copies together so a change to one fails here until the other follows.
 */
const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/20261004_delivery_followups.sql"), "utf8");

function serverMapping(): Record<string, string> {
  const m = sql.match(/v_new := case([\s\S]*?)end;/);
  expect(m, "appointment_update_delivery_status's v_new mapping must exist").toBeTruthy();
  const out: Record<string, string> = {};
  for (const arm of m![1].matchAll(/when p_status (?:in \(([^)]*)\)|= '([A-Z_]+)') then '([A-Z_]+)'/g)) {
    const froms = arm[1] ? arm[1].split(",").map((s) => s.trim().replace(/'/g, "")) : [arm[2]];
    for (const f of froms) out[f] = arm[3];
  }
  return out;
}

describe("liveStatusToDeliveryStatus", () => {
  it("maps every live status exactly as the server does", () => {
    const server = serverMapping();
    expect(Object.keys(server).sort()).toEqual(["ARRIVED", "DONE", "LEAVING", "ON_THE_WAY"]);
    for (const [live, lifecycle] of Object.entries(server)) {
      expect(liveStatusToDeliveryStatus(live), live).toBe(lifecycle);
    }
  });

  it("treats no live status as not yet started", () => {
    expect(liveStatusToDeliveryStatus(null)).toBe("ASSIGNED");
  });
});
