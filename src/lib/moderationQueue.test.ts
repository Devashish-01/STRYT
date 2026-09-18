import { describe, it, expect } from "vitest";
import { groupReports, orderQueue, moderationKey, AUTO_CHECK_REASON } from "./moderationQueue";
import type { AdminReport } from "@/services/core/adminService";

let n = 0;
const report = (over: Partial<AdminReport>): AdminReport => ({
  id: `r${++n}`, targetType: "POST", targetId: "p1", targetName: "A post", reason: "SPAM", details: "",
  reporter: "Someone", reporterUserId: `u${n}`, status: "OPEN", time: "now", ...over,
});

describe("grouping open reports into decisions", () => {
  it("five reports on one post are one item with five people", () => {
    const items = groupReports([1, 2, 3, 4, 5].map((i) => report({ reporterUserId: `u${i}` })), {});
    expect(items).toHaveLength(1);
    expect(items[0].reports).toHaveLength(5);
    expect(items[0].reporterCount).toBe(5);
  });

  it("counts people, not reports", () => {
    const items = groupReports([report({ reporterUserId: "u1" }), report({ reporterUserId: "u1", reason: "SCAM" })], {});
    expect(items[0].reporterCount).toBe(1);
    expect(items[0].reasons).toEqual(["SPAM", "SCAM"]);
  });

  it("the automatic check is marked, and is not a person", () => {
    const items = groupReports([report({ reason: AUTO_CHECK_REASON, reporterUserId: null })], {});
    expect(items[0].automatic).toBe(true);
    expect(items[0].reporterCount).toBe(0);
  });

  it("the same id on different target types is two things", () => {
    const items = groupReports([report({ targetType: "POST", targetId: "x" }), report({ targetType: "COMMENT", targetId: "x" })], {});
    expect(items.map((i) => i.key)).toEqual(["POST:x", "COMMENT:x"]);
  });

  it("carries hidden state, a text preview and where to read it", () => {
    const items = groupReports([report({ targetType: "COMMENT", targetId: "c1" })], {
      [moderationKey("COMMENT", "c1")]: { hiddenAt: "2026-09-18T10:00:00Z", hiddenReason: "REPORTS", preview: "rude words", link: "/community/p9" },
    });
    expect(items[0]).toMatchObject({ hidden: true, hiddenReason: "REPORTS", preview: "rude words", link: "/community/p9" });
  });

  it("a restored item is not hidden, whatever reason was once recorded", () => {
    const items = groupReports([report({})], { [moderationKey("POST", "p1")]: { hiddenAt: null, hiddenReason: "REPORTS" } });
    expect(items[0]).toMatchObject({ hidden: false, hiddenReason: null });
  });
});

describe("the order a moderator works in", () => {
  const a = { ...groupReports([report({ targetId: "a" })], {})[0] };
  const b = { ...groupReports([report({ targetId: "b" }), report({ targetId: "b" })], {})[0] };
  const hidden = { ...groupReports([report({ targetId: "h" })], { "POST:h": { hiddenAt: "t", hiddenReason: "REPORTS" } })[0] };

  it("hidden first, since the author is waiting on the decision", () => {
    expect(orderQueue([a, b, hidden], {}).map((i) => i.targetId)).toEqual(["h", "b", "a"]);
  });

  it("then the classifier's priority, where there is one", () => {
    expect(orderQueue([a, b], { "POST:a": "urgent" }).map((i) => i.targetId)).toEqual(["a", "b"]);
    expect(orderQueue([a, b], { "POST:b": "low" }).map((i) => i.targetId)).toEqual(["a", "b"]);
  });

  it("then how many people reported it; ties keep their order", () => {
    expect(orderQueue([a, b], {}).map((i) => i.targetId)).toEqual(["b", "a"]);
    const a2 = { ...a, key: "POST:a2", targetId: "a2" };
    expect(orderQueue([a, a2], {}).map((i) => i.targetId)).toEqual(["a", "a2"]);
  });
});
