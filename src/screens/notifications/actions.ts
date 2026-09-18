import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import { notificationService, appointmentService, deliveryService, bulkService, locationService, customPaymentService, walletService, requestService } from "@/services";
import { openCalendarEvent } from "@/lib/calendarExport";
import { invalidateQueryCache } from "@/hooks/useApi";
import { openExternal } from "@/lib/openExternal";
import type { AppNotification } from "@/types";
import { errorMessage } from "@/lib/errorMessage";

/**
 * Everything a notification action can reach. It used to be the closure of Notifications.tsx's
 * handleAction — a 700-line if/else chain where a new action meant another `else if` and nothing could be
 * tested without rendering the screen.
 *
 * The bodies below are that chain, branch for branch, unchanged. Two things moved into the open:
 * the guards that used to live in the condition (`action === "ACCEPT" && meta?.appointmentId`) are now an
 * early return, which is what falling through to the next `else if` amounted to; and the closure values
 * each branch reads are named at the top of it.
 */
export interface NotificationActionContext {
  /** The notification the action was fired from. */
  n: AppNotification;
  /** Its metadata payload. Untyped at the source — the server writes a different shape per action. */
  meta: any;
  nav: NavigateFunction;
  showToast: (msg: string) => void;
  t: (key: string, fallback?: string) => string;
  setItems: Dispatch<SetStateAction<AppNotification[]>>;
  /** Re-reads the page after a failed optimistic update. */
  refetch: () => void;
  /** The unread-count cache to bust, or undefined when there is none. */
  badgeCacheKey: string | undefined;
  setDeclining: (v: { n: AppNotification; aptId: string } | null) => void;
  setDeclineNote: (v: string) => void;
}

export type NotificationAction = (ctx: NotificationActionContext) => void | Promise<void>;

/** Shared by VIEW_POST and REPLY_COMMENT — one branch served both in the chain this replaces. */
const viewPost: NotificationAction = (ctx) => {
  const { n, nav } = ctx;
  if (n.deepLink) {
    nav(n.deepLink);
  } else {
    nav("/community");
  }
};

/** Shared by REVIEW_BUSINESS and VIEW_ADMIN — one branch served both in the chain this replaces. */
const reviewBusiness: NotificationAction = (ctx) => {
  const { nav } = ctx;
  nav("/admin");
};

/** Shared by VIEW_REQUEST and SEND_QUOTE — one branch served both in the chain this replaces. */
const viewRequest: NotificationAction = (ctx) => {
  const { n, meta, nav } = ctx;
  if (meta?.requestId) {
    nav(`/request/${meta.requestId}`);
  } else if (n.deepLink) {
    nav(n.deepLink);
  }
};

/**
 * Every action a notification row can fire, keyed by the name the row sends.
 *
 * Order does not matter here, which it did in the chain: the first matching `else if` won, so a name
 * appearing twice meant the second branch was dead. OPEN_CHAT was such a name, and only the branch that
 * ran before is kept. The two differed (they fall back to different routes) and that is logged as P12-001
 * rather than corrected here — a refactor must not change behaviour, even behaviour that looks wrong.
 */
export const notificationActions: Record<string, NotificationAction> = {
  ACCEPT: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.appointmentId)) return;
    const aptId = meta.appointmentId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Confirmed",
                tone: "success",
                actions: [],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await appointmentService.updateStatus(aptId, "ACCEPTED");
      showToast(t("notif_apt_accepted_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't accept appointment"));
      refetch();
    }
  },
  DECLINE: (ctx) => {
    const { n, meta, setDeclining, setDeclineNote } = ctx;
    if (!(meta?.appointmentId)) return;
    setDeclineNote("");
    setDeclining({ n, aptId: meta.appointmentId });
  },
  CALENDAR: (ctx) => {
    const { meta } = ctx;
    openCalendarEvent({
      title: `Booking: ${meta?.serviceName || meta?.actorName || "STRYT Appointment"}`,
      description: `Appointment with ${meta?.actorName || "shop"}. Time: ${meta?.timeLabel || ""}`,
      startTime: meta?.scheduledFor,
      uid: meta?.appointmentId,
    });
  },
  RESCHEDULE: (ctx) => {
    const { n, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/appointments");
    }
  },
  ACCEPT_DELIVERY: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.batchId)) return;
    const batchId = meta.batchId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Accepted",
                tone: "success",
                actions: ["TRACK_DELIVERY"],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await deliveryService.acceptBatch(batchId);
      showToast(t("notif_dlv_accepted_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't accept delivery run"));
      refetch();
    }
  },
  DECLINE_DELIVERY: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.batchId)) return;
    const batchId = meta.batchId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Declined",
                tone: "danger",
                actions: [],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await deliveryService.declineBatch(batchId);
      showToast(t("notif_dlv_declined_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't decline delivery run"));
      refetch();
    }
  },
  TRACK_DELIVERY: (ctx) => {
    const { n, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/appointments");
    }
  },
  CALL_RIDER: (ctx) => {
    const { meta, showToast } = ctx;
    if (meta?.agentPhone) {
      window.open(`tel:${meta.agentPhone}`, "_self");
    } else {
      showToast("Phone number not available");
    }
  },
  CALL_CUSTOMER: (ctx) => {
    const { meta, showToast } = ctx;
    if (meta?.customerPhone) {
      window.open(`tel:${meta.customerPhone}`, "_self");
    } else {
      showToast("Phone number not available");
    }
  },
  REASSIGN_DELIVERY: (ctx) => {
    const { n, meta, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else if (meta?.targetId) {
      nav(`/business/${meta.targetId}/manage/deliveries`);
    } else {
      nav("/appointments");
    }
  },
  COPY_OTP: (ctx) => {
    const { showToast, t } = ctx;
    showToast(t("notif_dlv_otp_copied"));
  },
  VIEW_POST: viewPost,
  REPLY_COMMENT: viewPost,
  SHARE_ALERT: (ctx) => {
    const { n, showToast, t } = ctx;
    const shareUrl = window.location.origin + (n.deepLink || "/community");
    const shareData = {
      title: n.title,
      text: `${n.title}: ${n.body}`,
      url: shareUrl,
    };
    if (typeof navigator.share === "function") {
      void navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${n.title}\n${n.body}\n${shareUrl}`);
      showToast(t("notif_comm_alert_shared"));
    }
  },
  VIEW_RECOMMENDED: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.recommendedType === "BUSINESS" && meta?.recommendedId) {
      nav(`/business/${meta.recommendedId}`);
    } else if (meta?.recommendedType === "PROVIDER" && meta?.recommendedId) {
      nav(`/provider/${meta.recommendedId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/community");
    }
  },
  CONFIRM_DEPOSIT: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.dealId && meta?.pledgerUserId)) return;
    const dealId = meta.dealId;
    const pledgerUserId = meta.pledgerUserId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Deposit Confirmed",
                tone: "success",
                actions: ["VIEW_DEAL"],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await bulkService.confirmDeposit(dealId, pledgerUserId);
      showToast(t("notif_bulk_deposit_confirmed_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't confirm deposit"));
      refetch();
    }
  },
  REJECT_DEPOSIT: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.dealId && meta?.pledgerUserId)) return;
    const dealId = meta.dealId;
    const pledgerUserId = meta.pledgerUserId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Deposit Rejected",
                tone: "danger",
                actions: [],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await bulkService.rejectDeposit(dealId, pledgerUserId);
      showToast(t("notif_bulk_deposit_rejected_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't reject deposit"));
      refetch();
    }
  },
  VIEW_CLAIM_PASS: (ctx) => {
    const { nav } = ctx;
    nav("/community/activity");
  },
  VIEW_DEAL: (ctx) => {
    const { n, meta, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else if (meta?.targetId && meta?.dealId) {
      nav(`/business/${meta.targetId}/manage/bulk-deals/${meta.dealId}`);
    } else {
      nav("/community");
    }
  },
  SHARE_DEAL: (ctx) => {
    const { n, meta, showToast, t } = ctx;
    const shareUrl = window.location.origin + (n.deepLink || "/community");
    const shareData = {
      title: meta?.dealTitle || n.title,
      text: `${n.title}: ${n.body}`,
      url: shareUrl,
    };
    if (typeof navigator.share === "function") {
      void navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${n.title}\n${n.body}\n${shareUrl}`);
      showToast(t("notif_bulk_deal_shared_toast"));
    }
  },
  APPROVE_LOCATION: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.requesterUserId)) return;
    const reqId = meta.requesterUserId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Approved (24h)",
                tone: "success",
                actions: [],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await locationService.respond(reqId, true);
      showToast(t("notif_loc_approved_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't approve location request"));
      refetch();
    }
  },
  DECLINE_LOCATION: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.requesterUserId)) return;
    const reqId = meta.requesterUserId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Declined",
                tone: "neutral",
                actions: [],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await locationService.respond(reqId, false);
      showToast(t("notif_loc_declined_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't decline location request"));
      refetch();
    }
  },
  VIEW_ON_MAP: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.lat != null && meta?.lng != null) {
      nav(`/map?lat=${meta.lat}&lng=${meta.lng}`);
    } else if (meta?.ownerUserId) {
      nav(`/u/${meta.ownerUserId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/map");
    }
  },
  TRACK_LIVE: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.lat != null && meta?.lng != null) {
      nav(`/map?lat=${meta.lat}&lng=${meta.lng}&live=${meta.shareId || ""}`);
    } else if (meta?.conversationId) {
      nav(`/chat/${meta.conversationId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/map");
    }
  },
  OPEN_CHAT: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.conversationId) {
      nav(`/chat/${meta.conversationId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/chats");
    }
  },
  CONFIRM_CUSTOM_PAYMENT: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.paymentId)) return;
    const paymentId = meta.paymentId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Confirmed ✓",
                tone: "success",
                actions: ["VIEW_RECEIPT"],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await customPaymentService.confirm(paymentId);
      showToast(t("notif_pay_confirmed_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't confirm payment"));
      refetch();
    }
  },
  REJECT_CUSTOM_PAYMENT: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.paymentId)) return;
    const paymentId = meta.paymentId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Rejected",
                tone: "danger",
                actions: [],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await customPaymentService.reject(paymentId);
      showToast(t("notif_pay_rejected_toast"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't reject payment"));
      refetch();
    }
  },
  VIEW_RECEIPT: (ctx) => {
    const { n, meta, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else if (meta?.targetType === "BUSINESS" && meta?.targetId) {
      nav(`/business/${meta.targetId}/manage/payments`);
    } else if (meta?.targetType === "PROVIDER" && meta?.targetId) {
      nav(`/provider/${meta.targetId}/manage/money`);
    } else {
      nav("/profile");
    }
  },
  VIEW_STORE: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.targetType === "BUSINESS" && meta?.targetId) {
      nav(`/business/${meta.targetId}`);
    } else if (meta?.targetType === "PROVIDER" && meta?.targetId) {
      nav(`/provider/${meta.targetId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  RETRY_PAYMENT: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.targetType === "BUSINESS" && meta?.targetId) {
      nav(`/business/${meta.targetId}`);
    } else if (meta?.targetType === "PROVIDER" && meta?.targetId) {
      nav(`/provider/${meta.targetId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  REPLY_RATING: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.rateeType === "BUSINESS" && meta?.rateeId) {
      nav(`/business/${meta.rateeId}/manage/reviews`);
    } else if (meta?.rateeType === "PROVIDER" && meta?.rateeId) {
      nav(`/provider/${meta.rateeId}/manage/reviews`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  VIEW_REVIEW: (ctx) => {
    const { n, meta, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else if (meta?.targetType === "BUSINESS" && meta?.targetId) {
      nav(`/business/${meta.targetId}`);
    } else if (meta?.targetType === "PROVIDER" && meta?.targetId) {
      nav(`/provider/${meta.targetId}`);
    }
  },
  REVIEW_BUSINESS: reviewBusiness,
  VIEW_ADMIN: reviewBusiness,
  VIEW_REPORT_TARGET: (ctx) => {
    const { n, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/community");
    }
  },
  VIEW_BUSINESS: (ctx) => {
    const { n, meta, nav } = ctx;
    const bizId = meta?.businessId || meta?.entityId;
    if (bizId) {
      nav(`/business/${bizId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  VIEW_PROVIDER: (ctx) => {
    const { n, meta, nav } = ctx;
    const provId = meta?.providerId || meta?.entityId;
    if (provId) {
      nav(`/provider/${provId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  VIEW_PLACE: (ctx) => {
    const { n, meta, nav } = ctx;
    const plId = meta?.placeId || meta?.entityId;
    if (plId) {
      nav(`/place/${plId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  CLAIM_OFFER: async (ctx) => {
    const { n, meta, nav, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    const offerId = meta?.offerId;
    if (offerId) {
      setItems((p) =>
        p.map((x) =>
          x.id === n.id
            ? {
                ...x,
                isRead: true,
                metadata: {
                  ...x.metadata,
                  statusPill: "Saved to Wallet",
                  tone: "success",
                  actions: ["VIEW_STORE"],
                },
              }
            : x
        )
      );
      if (!n.isRead) void notificationService.markRead(n.id);
      if (meta?.offerCode) {
        navigator.clipboard?.writeText(meta.offerCode);
      }
      try {
        await walletService.saveCoupon(offerId);
        showToast(t("notif_disc_offer_saved_toast", "Coupon saved to your wallet! 🎉"));
        if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      } catch (err) {
        showToast(errorMessage(err, "Couldn't save coupon to wallet"));
        refetch();
      }
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  BOOK_APPOINTMENT: (ctx) => {
    const { n, meta, nav } = ctx;
    const provId = meta?.providerId || meta?.entityId;
    if (provId) {
      nav(`/provider/${provId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  CALL: (ctx) => {
    const { meta } = ctx;
    if (meta?.phone) {
      window.location.href = `tel:${meta.phone}`;
    }
  },
  DIRECTIONS: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.lat != null && meta?.lng != null) {
      openExternal(`https://www.google.com/maps/dir/?api=1&destination=${meta.lat},${meta.lng}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/map");
    }
  },
  ACCEPT_QUOTE: async (ctx) => {
    const { n, meta, nav, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.proposalId)) return;
    const propId = meta.proposalId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Accepted ✓",
                tone: "success",
                actions: ["VIEW_AGREEMENT"],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      const res = await requestService.acceptProposal(propId);
      showToast(t("notif_prop_accepted_toast", "Quote accepted! Agreement created 🎉"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      if (res.agreementId) nav(`/agreement/${res.agreementId}`);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't accept quote"));
      refetch();
    }
  },
  ACCEPT_COUNTER: async (ctx) => {
    const { n, meta, nav, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.proposalId && meta?.counterId)) return;
    const propId = meta.proposalId;
    const counterId = meta.counterId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Counter Accepted ✓",
                tone: "success",
                actions: ["VIEW_AGREEMENT"],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      const res = await requestService.acceptProposalCounter(propId, counterId);
      showToast(t("notif_prop_counter_accepted_toast", "Counter-offer accepted! 🎉"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
      if (res.agreementId) nav(`/agreement/${res.agreementId}`);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't accept counter-offer"));
      refetch();
    }
  },
  DECLINE_COUNTER: (ctx) => {
    const { n, showToast, t, setItems } = ctx;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Declined",
                tone: "danger",
                actions: [],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    showToast(t("notif_prop_counter_declined_toast", "Counter-offer declined"));
  },
  COUNTER_QUOTE: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.requestId) {
      nav(`/request/${meta.requestId}?counter=${meta.proposalId || ""}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  VIEW_QUOTE: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.requestId) {
      nav(`/request/${meta.requestId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  VIEW_AGREEMENT: (ctx) => {
    const { n, meta, nav } = ctx;
    const agId = meta?.agreementId || meta?.entityId;
    if (agId) {
      nav(`/agreement/${agId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    }
  },
  CONFIRM_PAYMENT: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.agreementId)) return;
    const agId = meta.agreementId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Payment Confirmed ✓",
                tone: "success",
                actions: ["VIEW_AGREEMENT"],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await requestService.confirmAgreementPayment(agId);
      showToast(t("notif_prop_payment_confirmed_toast", "Payment verified and confirmed ✓"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't confirm payment"));
      refetch();
    }
  },
  REJECT_PAYMENT: async (ctx) => {
    const { n, meta, showToast, t, setItems, refetch, badgeCacheKey } = ctx;
    if (!(meta?.agreementId)) return;
    const agId = meta.agreementId;
    setItems((p) =>
      p.map((x) =>
        x.id === n.id
          ? {
              ...x,
              isRead: true,
              metadata: {
                ...x.metadata,
                statusPill: "Payment Rejected",
                tone: "danger",
                actions: ["VIEW_AGREEMENT"],
              },
            }
          : x
      )
    );
    if (!n.isRead) void notificationService.markRead(n.id);
    try {
      await requestService.rejectAgreementPaymentClaim(agId);
      showToast(t("notif_prop_payment_rejected_toast", "Payment verification rejected"));
      if (badgeCacheKey) invalidateQueryCache(badgeCacheKey);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't reject payment"));
      refetch();
    }
  },
  PAY: (ctx) => {
    const { meta, nav } = ctx;
    if (!(meta?.agreementId)) return;
    nav(`/agreement/${meta.agreementId}`);
  },
  JOIN_DEAL: async (ctx) => {
    const { meta, nav, showToast, t } = ctx;
    if (!(meta?.requestId)) return;
    try {
      await requestService.meToo(meta.requestId);
      showToast(t("notif_prop_joined_deal_toast", "Joined group deal!"));
    } catch {
      // Navigate to request detail
      nav(`/request/${meta.requestId}`);
    }
  },
  VIEW_REQUEST: viewRequest,
  SEND_QUOTE: viewRequest,
  SWITCH_BUSINESS: (ctx) => {
    const { n, meta, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else if (meta?.businessId) {
      nav(`/account/business-access?biz=${meta.businessId}`);
    } else {
      nav("/account/business-access");
    }
  },
  RESUBMIT_VERIFY: (ctx) => {
    const { n, meta, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else if (meta?.providerId || meta?.targetType === "PROVIDER") {
      nav(`/provider/${meta.providerId || meta.targetId}/manage/verify`);
    } else if (meta?.businessId || meta?.targetType === "BUSINESS") {
      nav(`/business/${meta.businessId || meta.targetId}/manage/verify`);
    } else {
      nav("/settings");
    }
  },
  REPLY_CHAT: (ctx) => {
    const { n, meta, nav } = ctx;
    if (meta?.conversationId) {
      nav(`/chat/${meta.conversationId}`);
    } else if (n.deepLink) {
      nav(n.deepLink);
    } else {
      nav("/chat");
    }
  },
  ANSWER_QNA: (ctx) => {
    const { n, meta, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else if (meta?.businessId) {
      nav(`/business/${meta.businessId}/manage/community`);
    } else {
      nav("/community");
    }
  },
  VIEW_QNA: (ctx) => {
    const { n, meta, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    } else if (meta?.businessId) {
      nav(`/business/${meta.businessId}`);
    } else {
      nav("/community");
    }
  },
  VIEW_DETAILS: (ctx) => {
    const { n, nav } = ctx;
    if (n.deepLink) {
      nav(n.deepLink);
    }
  },
};
