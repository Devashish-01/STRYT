import { describe, it, expect, beforeEach, vi } from "vitest";

// Every service a notification action can reach. Mocked as a whole so a test can assert which method ran
// without a Supabase client existing at all.
vi.mock("@/services", () => ({
  notificationService: { markRead: vi.fn().mockResolvedValue(undefined) },
  appointmentService: { updateStatus: vi.fn().mockResolvedValue(undefined) },
  deliveryService: {
    acceptBatch: vi.fn().mockResolvedValue(undefined),
    declineBatch: vi.fn().mockResolvedValue(undefined),
  },
  bulkService: {
    confirmDeposit: vi.fn().mockResolvedValue(undefined),
    rejectDeposit: vi.fn().mockResolvedValue(undefined),
    saveCoupon: vi.fn().mockResolvedValue(undefined),
    meToo: vi.fn().mockResolvedValue(undefined),
  },
  locationService: { respond: vi.fn().mockResolvedValue(undefined) },
  customPaymentService: {
    confirm: vi.fn().mockResolvedValue(undefined),
    reject: vi.fn().mockResolvedValue(undefined),
  },
  walletService: {
    confirmAgreementPayment: vi.fn().mockResolvedValue(undefined),
    rejectAgreementPaymentClaim: vi.fn().mockResolvedValue(undefined),
  },
  requestService: {
    acceptProposal: vi.fn().mockResolvedValue(undefined),
    acceptProposalCounter: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/hooks/useApi", () => ({ invalidateQueryCache: vi.fn() }));
vi.mock("@/lib/calendarExport", () => ({ openCalendarEvent: vi.fn() }));
vi.mock("@/lib/openExternal", () => ({ openExternal: vi.fn() }));

import { notificationActions, type NotificationActionContext } from "./actions";
import { appointmentService, notificationService, deliveryService } from "@/services";
import { invalidateQueryCache } from "@/hooks/useApi";
import { openCalendarEvent } from "@/lib/calendarExport";
import type { AppNotification } from "@/types";

/**
 * These pin the behaviour of the if/else chain that `notificationActions` replaced (P12 step 1). Every
 * expectation below was read off the chain as it stood in the commit before the refactor, not off the
 * registry — a test written from the new code would only prove the new code matches itself.
 */

function makeNotification(over: Partial<AppNotification> = {}): AppNotification {
  return { id: "n1", isRead: false, deepLink: undefined, metadata: {}, ...over } as AppNotification;
}

function makeCtx(over: Partial<NotificationActionContext> = {}): NotificationActionContext {
  return {
    n: makeNotification(),
    meta: {},
    nav: vi.fn(),
    showToast: vi.fn(),
    t: (key: string) => key,
    setItems: vi.fn(),
    refetch: vi.fn(),
    badgeCacheKey: "notif:customer",
    setDeclining: vi.fn(),
    setDeclineNote: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the registry covers the chain it replaced", () => {
  // The 60 names the chain matched. Frozen so removing one is a test failure rather than a silent
  // dead button on a notification row.
  const NAMES = [
    "ACCEPT", "DECLINE", "CALENDAR", "RESCHEDULE", "ACCEPT_DELIVERY", "DECLINE_DELIVERY", "TRACK_DELIVERY",
    "CALL_RIDER", "CALL_CUSTOMER", "REASSIGN_DELIVERY", "COPY_OTP", "VIEW_POST", "REPLY_COMMENT",
    "SHARE_ALERT", "VIEW_RECOMMENDED", "CONFIRM_DEPOSIT", "REJECT_DEPOSIT", "VIEW_CLAIM_PASS", "VIEW_DEAL",
    "SHARE_DEAL", "APPROVE_LOCATION", "DECLINE_LOCATION", "VIEW_ON_MAP", "TRACK_LIVE", "OPEN_CHAT",
    "CONFIRM_CUSTOM_PAYMENT", "REJECT_CUSTOM_PAYMENT", "VIEW_RECEIPT", "VIEW_STORE", "RETRY_PAYMENT",
    "REPLY_RATING", "VIEW_REVIEW", "REVIEW_BUSINESS", "VIEW_ADMIN", "VIEW_REPORT_TARGET", "VIEW_BUSINESS",
    "VIEW_PROVIDER", "VIEW_PLACE", "CLAIM_OFFER", "BOOK_APPOINTMENT", "CALL", "DIRECTIONS", "ACCEPT_QUOTE",
    "ACCEPT_COUNTER", "DECLINE_COUNTER", "COUNTER_QUOTE", "VIEW_QUOTE", "VIEW_AGREEMENT", "CONFIRM_PAYMENT",
    "REJECT_PAYMENT", "PAY", "JOIN_DEAL", "VIEW_REQUEST", "SEND_QUOTE", "SWITCH_BUSINESS", "RESUBMIT_VERIFY",
    "REPLY_CHAT", "ANSWER_QNA", "VIEW_QNA", "VIEW_DETAILS",
  ];

  it("registers every action name the chain matched, and no others", () => {
    expect(Object.keys(notificationActions).sort()).toEqual([...NAMES].sort());
  });

  it("does nothing for an action name it does not know", () => {
    expect(notificationActions["NOT_A_REAL_ACTION"]).toBeUndefined();
  });
});

describe("navigation", () => {
  // action, meta, deepLink -> the route the chain navigated to.
  const CASES: [string, Record<string, unknown>, string | undefined, string][] = [
    ["RESCHEDULE", {}, "/appointments/7", "/appointments/7"],
    ["RESCHEDULE", {}, undefined, "/appointments"],
    ["TRACK_DELIVERY", {}, undefined, "/appointments"],
    ["REASSIGN_DELIVERY", { targetId: "b9" }, undefined, "/business/b9/manage/deliveries"],
    ["REASSIGN_DELIVERY", {}, undefined, "/appointments"],
    ["VIEW_POST", {}, undefined, "/community"],
    ["REPLY_COMMENT", {}, "/community/p3", "/community/p3"],
    ["VIEW_CLAIM_PASS", {}, undefined, "/community/activity"],
    ["VIEW_DEAL", { targetId: "b1", dealId: "d2" }, undefined, "/business/b1/manage/bulk-deals/d2"],
    ["VIEW_STORE", { targetType: "BUSINESS", targetId: "b4" }, undefined, "/business/b4"],
    ["VIEW_STORE", { targetType: "PROVIDER", targetId: "p4" }, undefined, "/provider/p4"],
    ["RETRY_PAYMENT", { targetType: "PROVIDER", targetId: "p5" }, undefined, "/provider/p5"],
    ["REPLY_RATING", { rateeType: "BUSINESS", rateeId: "b6" }, undefined, "/business/b6/manage/reviews"],
    ["REPLY_RATING", { rateeType: "PROVIDER", rateeId: "p6" }, undefined, "/provider/p6/manage/reviews"],
    ["VIEW_REVIEW", { targetType: "BUSINESS", targetId: "b7" }, undefined, "/business/b7"],
    ["REVIEW_BUSINESS", {}, undefined, "/admin"],
    ["VIEW_ADMIN", {}, undefined, "/admin"],
    ["VIEW_REPORT_TARGET", {}, undefined, "/community"],
    ["VIEW_BUSINESS", { businessId: "b8" }, undefined, "/business/b8"],
    ["VIEW_BUSINESS", { entityId: "b8b" }, undefined, "/business/b8b"],
    ["VIEW_PROVIDER", { providerId: "p8" }, undefined, "/provider/p8"],
    ["OPEN_CHAT", { conversationId: "c1" }, undefined, "/chat/c1"],
    ["REPLY_CHAT", { conversationId: "c2" }, undefined, "/chat/c2"],
  ];

  it.each(CASES)("%s with %o goes to %s", async (action, meta, deepLink, expected) => {
    const ctx = makeCtx({ meta, n: makeNotification({ deepLink } as Partial<AppNotification>) });
    await notificationActions[action](ctx);
    expect(ctx.nav).toHaveBeenCalledWith(expected);
  });

  it("prefers an explicit deepLink over the metadata route, as the chain did", async () => {
    const ctx = makeCtx({
      meta: { targetId: "b1", dealId: "d2" },
      n: makeNotification({ deepLink: "/somewhere/else" } as Partial<AppNotification>),
    });
    await notificationActions["VIEW_DEAL"](ctx);
    expect(ctx.nav).toHaveBeenCalledWith("/somewhere/else");
  });

  // P12-001. OPEN_CHAT matched twice in the chain and the first branch won, so the two fall back to
  // different routes — and /chat is not a registered route. Pinned here so the fix is deliberate and
  // this test is updated with it, rather than the difference being lost in a later refactor.
  it("keeps the two chat fallbacks different, as first-match-wins left them (P12-001)", async () => {
    const open = makeCtx();
    await notificationActions["OPEN_CHAT"](open);
    expect(open.nav).toHaveBeenCalledWith("/chats");

    const reply = makeCtx();
    await notificationActions["REPLY_CHAT"](reply);
    expect(reply.nav).toHaveBeenCalledWith("/chat");
  });
});

describe("guards that used to live in the else-if condition", () => {
  it("ACCEPT does nothing without an appointmentId", async () => {
    const ctx = makeCtx({ meta: {} });
    await notificationActions["ACCEPT"](ctx);
    expect(appointmentService.updateStatus).not.toHaveBeenCalled();
    expect(ctx.setItems).not.toHaveBeenCalled();
  });

  it("DECLINE does nothing without an appointmentId", async () => {
    const ctx = makeCtx({ meta: {} });
    await notificationActions["DECLINE"](ctx);
    expect(ctx.setDeclining).not.toHaveBeenCalled();
  });

  it("ACCEPT_DELIVERY does nothing without a batchId", async () => {
    const ctx = makeCtx({ meta: {} });
    await notificationActions["ACCEPT_DELIVERY"](ctx);
    expect(deliveryService.acceptBatch).not.toHaveBeenCalled();
  });
});

describe("optimistic update, server call, rollback", () => {
  it("ACCEPT updates the row, marks it read, calls the service and busts the badge cache", async () => {
    const ctx = makeCtx({ meta: { appointmentId: "a1" } });
    await notificationActions["ACCEPT"](ctx);

    expect(ctx.setItems).toHaveBeenCalledTimes(1);
    expect(notificationService.markRead).toHaveBeenCalledWith("n1");
    expect(appointmentService.updateStatus).toHaveBeenCalledWith("a1", "ACCEPTED");
    expect(ctx.showToast).toHaveBeenCalledWith("notif_apt_accepted_toast");
    expect(invalidateQueryCache).toHaveBeenCalledWith("notif:customer");
    expect(ctx.refetch).not.toHaveBeenCalled();
  });

  it("ACCEPT rolls back with the server's message when the call fails", async () => {
    vi.mocked(appointmentService.updateStatus).mockRejectedValueOnce(new Error("Slot already taken"));
    const ctx = makeCtx({ meta: { appointmentId: "a1" } });
    await notificationActions["ACCEPT"](ctx);

    expect(ctx.showToast).toHaveBeenCalledWith("Slot already taken");
    expect(ctx.refetch).toHaveBeenCalledTimes(1);
    expect(invalidateQueryCache).not.toHaveBeenCalled();
  });

  it("ACCEPT does not re-mark a notification that was already read", async () => {
    const ctx = makeCtx({ meta: { appointmentId: "a1" }, n: makeNotification({ isRead: true }) });
    await notificationActions["ACCEPT"](ctx);
    expect(notificationService.markRead).not.toHaveBeenCalled();
  });

  it("ACCEPT_DELIVERY accepts the batch and toasts", async () => {
    const ctx = makeCtx({ meta: { batchId: "b1" } });
    await notificationActions["ACCEPT_DELIVERY"](ctx);
    expect(deliveryService.acceptBatch).toHaveBeenCalledWith("b1");
    expect(ctx.showToast).toHaveBeenCalledWith("notif_dlv_accepted_toast");
  });

  it("DECLINE opens the decline sheet instead of calling a service", async () => {
    const ctx = makeCtx({ meta: { appointmentId: "a2" } });
    await notificationActions["DECLINE"](ctx);
    expect(ctx.setDeclineNote).toHaveBeenCalledWith("");
    expect(ctx.setDeclining).toHaveBeenCalledWith({ n: ctx.n, aptId: "a2" });
    expect(appointmentService.updateStatus).not.toHaveBeenCalled();
  });
});

describe("actions that leave the app", () => {
  it("CALENDAR builds the event from the notification metadata", async () => {
    const ctx = makeCtx({
      meta: { serviceName: "Haircut", actorName: "Sharma Salon", timeLabel: "3pm", scheduledFor: "2026-09-20T09:30:00Z", appointmentId: "a3" },
    });
    await notificationActions["CALENDAR"](ctx);
    expect(openCalendarEvent).toHaveBeenCalledWith({
      title: "Booking: Haircut",
      description: "Appointment with Sharma Salon. Time: 3pm",
      startTime: "2026-09-20T09:30:00Z",
      uid: "a3",
    });
  });

  it("CALL_RIDER dials the agent, and says so when there is no number", async () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });

    const withPhone = makeCtx({ meta: { agentPhone: "9876543210" } });
    await notificationActions["CALL_RIDER"](withPhone);
    expect(open).toHaveBeenCalledWith("tel:9876543210", "_self");

    const without = makeCtx({ meta: {} });
    await notificationActions["CALL_RIDER"](without);
    expect(without.showToast).toHaveBeenCalledWith("Phone number not available");

    vi.unstubAllGlobals();
  });
});
