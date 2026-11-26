import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({
  currentUserId: vi.fn().mockResolvedValue("test-user"),
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({ range: db.range }),
          }),
        }),
      }),
    }),
  }),
}));

import { notificationService } from "./notificationService";

describe("getUnreadBreakdown", () => {
  it("counts every scope when unread notifications exceed one page", async () => {
    db.range.mockReset().mockImplementation(async (from: number, to: number) => ({
      data: Array.from({ length: Math.max(0, Math.min(to + 1, 501) - from) }, (_, i) => ({
        id: String(from + i),
        type: from + i === 500 ? "DELIVERY" : "SYSTEM",
        deep_link: from + i === 500 ? "/delivery" : "/notifications",
      })),
      error: null,
    }));

    const breakdown = await notificationService.getUnreadBreakdown();
    expect(db.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(breakdown).toEqual({
      all: 501,
      personal: 500,
      delivery: 1,
      byKey: { personal: 500, delivery: 1 },
    });
  });
});
