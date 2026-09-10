import { describe, it, expect } from "vitest";

describe("Sprint 5: Deals, Requests & Group Buys", () => {
  describe("Single-sided budget formatting (P9)", () => {
    function formatBudget(min?: number, max?: number, openLabel = "Open"): string {
      if (min && max) return `₹${min.toLocaleString("en-IN")}–₹${max.toLocaleString("en-IN")}`;
      if (max) return `Up to ₹${max.toLocaleString("en-IN")}`;
      if (min) return `From ₹${min.toLocaleString("en-IN")}`;
      return openLabel;
    }

    it("formats both min and max as a range", () => {
      expect(formatBudget(500, 1500)).toBe("₹500–₹1,500");
    });

    it("formats max only as 'Up to ₹X'", () => {
      expect(formatBudget(undefined, 2000)).toBe("Up to ₹2,000");
    });

    it("formats min only as 'From ₹X'", () => {
      expect(formatBudget(300, undefined)).toBe("From ₹300");
    });

    it("formats neither as 'Open'", () => {
      expect(formatBudget(undefined, undefined)).toBe("Open");
    });
  });

  describe("RateScreen party resolution (A5)", () => {
    interface AgreementMock {
      requesterUserId: string;
      requesterName: string;
      requesterAvatar: string;
      responderUserId: string;
      responderName: string;
      responderAvatar: string;
    }

    function resolveRatee(a: AgreementMock, viewerUserId: string) {
      const isRequester = viewerUserId === a.requesterUserId;
      return {
        isRequester,
        targetUserId: isRequester ? a.responderUserId : a.requesterUserId,
        targetName: isRequester ? a.responderName : a.requesterName,
        targetAvatar: isRequester ? a.responderAvatar : a.requesterAvatar,
      };
    }

    const agreement: AgreementMock = {
      requesterUserId: "user_req_123",
      requesterName: "Customer John",
      requesterAvatar: "https://example.com/john.jpg",
      responderUserId: "user_prov_456",
      responderName: "Plumber Raj",
      responderAvatar: "https://example.com/raj.jpg",
    };

    it("rates responder when customer is viewer", () => {
      const resolved = resolveRatee(agreement, "user_req_123");
      expect(resolved.isRequester).toBe(true);
      expect(resolved.targetUserId).toBe("user_prov_456");
      expect(resolved.targetName).toBe("Plumber Raj");
      expect(resolved.targetAvatar).toBe("https://example.com/raj.jpg");
    });

    it("rates customer when provider is viewer (avoid self-rating inversion)", () => {
      const resolved = resolveRatee(agreement, "user_prov_456");
      expect(resolved.isRequester).toBe(false);
      expect(resolved.targetUserId).toBe("user_req_123");
      expect(resolved.targetName).toBe("Customer John");
      expect(resolved.targetAvatar).toBe("https://example.com/john.jpg");
    });
  });

  describe("Bilateral counter acceptance (P1)", () => {
    interface Counter {
      id: string;
      amount: number;
      by: "requester" | "responder";
    }

    function canAcceptCounter(
      viewerRole: "requester" | "responder",
      latestCounter: Counter | undefined,
      requestStatus: string,
      alreadyAccepted: boolean
    ): boolean {
      if (requestStatus !== "OPEN" || alreadyAccepted || !latestCounter) return false;
      if (viewerRole === "requester" && latestCounter.by === "responder") return true;
      if (viewerRole === "responder" && latestCounter.by === "requester") return true;
      return false;
    }

    const customerCounter: Counter = { id: "c1", amount: 800, by: "requester" };
    const providerCounter: Counter = { id: "c2", amount: 950, by: "responder" };

    it("allows requester to accept responder counter", () => {
      expect(canAcceptCounter("requester", providerCounter, "OPEN", false)).toBe(true);
    });

    it("disallows requester from accepting their own counter", () => {
      expect(canAcceptCounter("requester", customerCounter, "OPEN", false)).toBe(false);
    });

    it("allows responder to accept requester counter", () => {
      expect(canAcceptCounter("responder", customerCounter, "OPEN", false)).toBe(true);
    });

    it("disallows responder from accepting their own counter", () => {
      expect(canAcceptCounter("responder", providerCounter, "OPEN", false)).toBe(false);
    });

    it("disallows acceptance if request is not OPEN or already accepted", () => {
      expect(canAcceptCounter("responder", customerCounter, "CLOSED", false)).toBe(false);
      expect(canAcceptCounter("responder", customerCounter, "OPEN", true)).toBe(false);
    });
  });

  describe("Bulk deal balance due calculation (BLK-4, BLK-1)", () => {
    function calculateVoucherBalances(
      quantity: number,
      unitPrice: number,
      depositAmountPerUnit: number | null
    ) {
      const totalDue = quantity * unitPrice;
      const depositPaid = depositAmountPerUnit ? quantity * depositAmountPerUnit : 0;
      const balanceDue = Math.max(0, totalDue - depositPaid);
      return { totalDue, depositPaid, balanceDue };
    }

    it("calculates balance due when deposit was collected", () => {
      // 5 units at ₹200 = ₹1,000 total. Deposit ₹50/unit = ₹250. Balance due = ₹750.
      const calc = calculateVoucherBalances(5, 200, 50);
      expect(calc.totalDue).toBe(1000);
      expect(calc.depositPaid).toBe(250);
      expect(calc.balanceDue).toBe(750);
    });

    it("calculates balance due on zero/no-deposit deals (BLK-1)", () => {
      // 10 units at ₹150 = ₹1,500 total. No deposit. Balance due = ₹1,500.
      const calc = calculateVoucherBalances(10, 150, null);
      expect(calc.totalDue).toBe(1500);
      expect(calc.depositPaid).toBe(0);
      expect(calc.balanceDue).toBe(1500);
    });
  });

  describe("Category regex matching with word boundaries (R5)", () => {
    const categories = [
      { id: "cat_it", name: "IT & Tech" },
      { id: "cat_fit", name: "Fitness & Gym" },
      { id: "cat_clean", name: "Cleaning" },
    ];

    function matchCategory(input: string) {
      return categories.find((c) => {
        const words = c.name.toLowerCase().split(/\s*&\s*|\s+/);
        return words.some((w) => {
          if (w.length < 3) return false;
          const rx = new RegExp(`\\b${w}\\b`, "i");
          return rx.test(input);
        });
      });
    }

    it("matches exact words with boundary", () => {
      expect(matchCategory("need fitness trainer")?.id).toBe("cat_fit");
      expect(matchCategory("house cleaning service")?.id).toBe("cat_clean");
    });

    it("does not false-positive match substring inside other words", () => {
      // 'fit' should not match inside 'benefit'
      expect(matchCategory("benefit package review")).toBeUndefined();
      // 'it' is < 3 chars so skipped, but 'tech' requires boundary
      expect(matchCategory("architectural drawing")).toBeUndefined();
    });
  });

  describe("Agreement expiry window 12h countdown (A3)", () => {
    it("computes remaining seconds based on 12 hours (43200 seconds)", () => {
      const now = 1725950000000;
      const createdAt = new Date(now).toISOString();
      const expiresAt = new Date(createdAt).getTime() + 12 * 60 * 60 * 1000;
      const diffSeconds = Math.floor((expiresAt - now) / 1000);
      expect(diffSeconds).toBe(43200);

      const h = Math.floor(diffSeconds / 3600);
      const m = Math.floor((diffSeconds % 3600) / 60);
      expect(`${h}h ${m.toString().padStart(2, "0")}m`).toBe("12h 00m");
    });
  });
});
