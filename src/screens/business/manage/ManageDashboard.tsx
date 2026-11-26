import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BadgeCheck, Calendar, Camera, Check, ChevronRight, HelpCircle,
  Megaphone, Play, QrCode, Search, Star,
  Users, Wallet, X as XIcon,
} from "@/components/Icons";
import {
  appointmentService, businessService, bulkService, deliveryService, notificationService, requestService,
} from "@/services";
import type { AppointmentDelivery } from "@/services/engagement/deliveryService";
import { chatService } from "@/services/engagement/chatService";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { AppBar } from "@/components/common";
import { inr } from "@/lib/format";
import { ErrorView, Skeleton } from "@/components/states";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import type { AppointmentRecord, QnaItem, QueueOwnerToken, RequestPost } from "@/types";
import { claimContextKey } from "@/lib/dashboardOrders";
import ManageNav from "./ManageNav";
import { resolveBusinessToolVisibility } from "@/lib/businessTools";
import BusinessConsoleHeader from "@/components/console/BusinessConsoleHeader";
import ConsoleStatusStrip from "@/components/console/ConsoleStatusStrip";
import { useBusinessConsoleData } from "@/features/business-home/businessConsoleData";
import ShareCard from "@/components/ShareCard";
import { AccountStatusBanner } from "@/components/AccountStatusBanner";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { useBusinessAccess } from "@/lib/businessAccess";
import { errorMessage } from "@/lib/errorMessage";
import DashboardOrderCard from "@/components/orders/DashboardOrderCard";

export default function ManageDashboard() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, user, notifUnread } = useApp();
  const { t, tf } = useI18n();
  const ambient = useAmbientTheme(user.lat, user.lng, "business");
  // TMA-006 — no RequireScope on this route: it sits directly under
  // BusinessAccessGuard and self-hides by scope. Anything added here is
  // visible to EVERY grantee unless explicitly gated on hasScope()/isOwner.
  const access = useBusinessAccess();
  const { isOwner, hasScope, consoleMode, scopeLabel } = access;
  const tools = resolveBusinessToolVisibility(access, DELIVERY_AGENT_ENABLED);
  const base = `/business/${id}/manage`;
  const [share, setShare] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [packingId, setPackingId] = useState<string | null>(null);

  const work = useBusinessConsoleData();
  const { shop: { data: business, loading: businessLoading }, status } = work;
  const { data: queue, loading: queueLoading, error: queueError, refetch: refetchQueue } = work.queue;
  const { data: appointments, loading: appointmentsLoading, error: appointmentsError, refetch: refetchAppointments } = work.appointments;
  const deliveryOrderIds = (appointments ?? [])
    .filter((a) => a.status === "ACCEPTED" && a.fulfillmentType === "DELIVERY")
    .map((a) => a.id);
  const { data: deliveryMap, refetch: refetchDeliveryMap } = useQuery(
    () =>
      DELIVERY_AGENT_ENABLED && deliveryOrderIds.length > 0
        ? deliveryService.forAppointments(deliveryOrderIds)
        : Promise.resolve({} as Record<string, AppointmentDelivery>),
    [deliveryOrderIds.join(",")],
    `dashboard:delivery-map:${id}`,
  );
  const { data: customPayments, loading: customLoading, error: customError, refetch: refetchCustom } = work.custom;
  const { data: pendingBulkDeposits, loading: bulkLoading, error: bulkError, refetch: refetchBulkDeposits } = work.bulk;
  const { data: questions, loading: questionsLoading, error: questionsError, refetch: refetchQuestions } = work.questions;
  const { data: reviews } = useQueryWithRealtime(
    () => businessService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`, `business:${id}:reviews`,
  );
  const { data: requestFeed } = useQueryWithRealtime(
    () => requestService.feed({
      lat: business?.lat ?? undefined,
      lng: business?.lng ?? undefined,
      radiusKm: business?.broadcastRadius ?? undefined,
    }),
    "requests",
    [business?.lat, business?.lng, business?.broadcastRadius],
    undefined,
    `business:${id}:find-work`
  );
  const { data: notificationUnread } = useQueryWithRealtime(
    () => notificationService.getUnreadCount({ scope: "BUSINESS", id }), "notifications", [id, user.id], user.id ? `user_id=eq.${user.id}` : undefined, `notif:business:${id}`,
  );
  const { data: chatUnread } = useQueryWithRealtime(
    () => chatService.totalUnread({ scope: "BUSINESS", id }), "conversations", [id], undefined, `chat:business:${id}`,
  );

  useEffect(() => {
    if (!business?.boostedUntil || business.boostReminderSent) return;
    const hoursLeft = (new Date(business.boostedUntil).getTime() - Date.now()) / 3_600_000;
    if (hoursLeft > 0 && hoursLeft <= 24) {
      showToast(t("mdash_boost_expiring"));
      businessService.markBoostReminderSent(id).catch(() => {});
    }
    // `t` is deliberately omitted. It is a fresh function every time a language file finishes loading,
    // and this effect must fire once: re-running it would show the boost toast a second time, before
    // markBoostReminderSent has come back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.boostedUntil, business?.boostReminderSent, id, showToast]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title={t("home")} />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  // First paint with nothing cached yet (see useQuery's cacheKey) — everything
  // below reads business?.field with optional chaining, so without this guard
  // the dashboard used to render immediately on empty/undefined data and then
  // visibly "pop" once the fetch resolved instead of showing a loading state.
  if (businessLoading && !business) {
    return (
      <div className="screen with-nav">
        <AppBar title={t("home")} />
        <div className="page-pad col gap-14" style={{ marginTop: 12 }}>
          <Skeleton h={120} r={20} mb={0} />
          <Skeleton h={56} mb={0} />
          <Skeleton h={90} r={16} mb={0} />
          <Skeleton h={90} r={16} mb={0} />
        </div>
      </div>
    );
  }

  const { queueClaims, customClaims, paymentClaims, paidRecords, recordedAmount: recordedPaid } = work.money;
  const { ordersRightNow, pendingBookings, standaloneAppointmentClaims, unanswered, actionCount } = work;
  const bulkDepositClaims = pendingBulkDeposits ?? [];
  const range = business?.broadcastRadius ?? 5;
  // Read-only reach shown in the header; editing lives on the dedicated
  // Service radius screen (Business hub) now, not on this dashboard.
  const radiusLabel = range >= 5000 ? "🌍 Worldwide" : range === 0.5 ? "500 m" : `${range} km`;
  const matchingRequests = ((requestFeed?.data ?? []) as RequestPost[])
    .filter((item) => item.status === "OPEN")
    .filter((item) => !item.categoryId || !business?.categoryId || item.categoryId === business.categoryId)
    .filter((item) => !item.lat || !item.lng || item.distanceKm <= range);

  const { today: todayAppointments, upcoming: upcomingList } = work;

  async function markPacked(aptId: string) {
    if (packingId) return;
    setPackingId(aptId);
    try {
      await deliveryService.markOrderReady(aptId);
      showToast(t("dlv_marked_packed") || "Order marked packed & ready!");
      refetchAppointments();
      refetchDeliveryMap();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't update order"));
    } finally {
      setPackingId(null);
    }
  }

  async function acceptAndPack(item: AppointmentRecord) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      if (item.fulfillmentType === "DELIVERY") {
        await appointmentService.acceptWithEta(item.id, "30-45 min");
      } else {
        await appointmentService.updateStatus(item.id, "ACCEPTED");
      }
      try {
        await deliveryService.markOrderReady(item.id);
      } catch (err) {
        console.warn("Could not mark order ready immediately", err);
      }
      showToast(t("mdash_accepted_packed_toast"));
      refetchAppointments();
      refetchDeliveryMap();
    } catch (e: any) {
      showToast(errorMessage(e, t("mdash_appointment_failed")));
    } finally {
      setBusyId(null);
    }
  }

  async function acceptWithPayment(item: AppointmentRecord) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await appointmentService.confirmPayment(item.id);
      if (item.fulfillmentType === "DELIVERY") {
        await appointmentService.acceptWithEta(item.id, "30-45 min");
      } else {
        await appointmentService.updateStatus(item.id, "ACCEPTED");
      }
      showToast(t("mdash_accepted_paid_toast"));
      refetchAppointments();
      refetchDeliveryMap();
    } catch (e: any) {
      showToast(errorMessage(e, t("mdash_appointment_failed")));
    } finally {
      setBusyId(null);
    }
  }

  const composeState = {
    businessId: id,
    businessName: business?.name,
    businessAvatar: business?.coverImage,
  };

  async function updateAppointment(item: AppointmentRecord, status: "ACCEPTED" | "REJECTED" | "COMPLETED") {
    if (status === "COMPLETED" && item.fulfillmentType === "DELIVERY") {
      nav(`${base}/deliveries`);
      return;
    }
    setBusyId(item.id);
    try {
      if (status === "ACCEPTED" && item.fulfillmentType === "DELIVERY") {
        await appointmentService.acceptWithEta(item.id, "30-45 min");
      } else {
        await appointmentService.updateStatus(item.id, status);
      }
      showToast(
        status === "ACCEPTED"
          ? "Order accepted 🛍️"
          : status === "COMPLETED"
          ? "Order handover completed! ✅"
          : "Order declined"
      );
      refetchAppointments();
    } catch (e: any) {
      const msg = errorMessage(e, "");
      if (/VISIT_NOT_STARTED/i.test(msg)) {
        showToast("This order is scheduled for later. Handover can be completed once within 1 hour of scheduled time.");
      } else if (/INVALID_TRANSITION/i.test(msg)) {
        showToast("This order was already updated. Refreshing...");
        refetchAppointments();
      } else {
        showToast(errorMessage(e, t("mdash_appointment_failed")));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function updateAppointmentPayment(item: AppointmentRecord, accept: boolean) {
    setBusyId(item.id);
    try {
      if (accept) await appointmentService.confirmPayment(item.id);
      else await appointmentService.rejectPaymentClaim(item.id);
      showToast(accept ? "Payment confirmed" : "Payment claim rejected");
      refetchAppointments();
    } catch (e: any){
      console.error("Payment update failed:", e);
      const errorMsg = e?.message || "Couldn't update payment";
      showToast(errorMsg);
    } finally {
      setBusyId(null);
    }
  }

  async function updateQueuePayment(item: QueueOwnerToken, accept: boolean) {
    setBusyId(item.id);
    try {
      if (accept) await businessService.confirmQueuePayment(item.id);
      else await businessService.rejectQueuePaymentClaim(item.id);
      showToast(accept ? "Queue payment confirmed" : "Queue payment claim rejected");
      refetchQueue();
    } catch {
      showToast(t("mdash_queue_payment_failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function updateBulkDeposit(item: { dealId: string; userId: string }, accept: boolean) {
    setBusyId(item.userId);
    try {
      if (accept) await bulkService.confirmDeposit(item.dealId, item.userId);
      else await bulkService.rejectDeposit(item.dealId, item.userId);
      showToast(accept ? "Deposit confirmed" : "Deposit claim rejected");
      refetchBulkDeposits();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't update deposit"));
    } finally {
      setBusyId(null);
    }
  }

  async function callNext() {
    const next = queue?.waiting?.[0];
    if (!next) return;
    setBusyId("queue-call-next");
    try {
      const result = await businessService.callNextToken(id);
      if (!result.ok) throw new Error(result.message);
      showToast(tf("mdash_called", { name: result.name }));
      refetchQueue();
    } catch (error) {
      showToast(errorMessage(error, "Couldn't call next"));
    } finally {
      setBusyId(null);
    }
  }

  async function postAnswer(question: QnaItem) {
    if (answer.trim().length < 2) return;
    setBusyId(question.id);
    try {
      await businessService.answerQuestion(question.id, answer.trim());
      setAnswer("");
      setAnsweringId(null);
      showToast(t("mdash_answer_posted"));
      refetchQuestions();
    } catch {
      showToast(t("mdash_answer_failed"));
    } finally {
      setBusyId(null);
    }
  }


  const headerSubtitle = isOwner
    ? `${ambient.greeting} · ${business?.ratingAvg ?? 0}★ · 📡 ${radiusLabel} reach`
    : consoleMode === "full_delegate"
      ? t("mdash_delegated_full")
      : tf("mdash_team_access", { scope: scopeLabel });

  return (
    <div className="screen with-nav">
      <BusinessConsoleHeader
        id={id}
        business={business}
        isOwner={isOwner}
        canOpenMessages={tools.leads}
        consoleMode={consoleMode}
        ambient={ambient}
        subtitle={headerSubtitle}
        notificationUnread={notificationUnread ?? 0}
        totalNotificationUnread={notifUnread}
        chatUnread={chatUnread ?? 0}
        onShare={() => setShare(true)}
      />

      <div className="screen-scroll">
        {isOwner && (
          <div style={{ paddingTop: 12 }}>
            <AccountStatusBanner entityType="BUSINESS" entityId={id} status={business?.status} rejectionReason={business?.rejectionReason} />
          </div>
        )}

        {business && (
          <section className="page-pad">
            <ConsoleStatusStrip available={status.available} booking={status.booking}
              availabilityKey={status.available ? "bhome_open_now" : "bhome_closed_now"}
              editPath={isOwner ? base : undefined} />
          </section>
        )}

        {/* "Zero is not data" (DESIGN_PRINCIPLES §5) — a brand-new shop with the
            queue switched off and nobody waiting was shown "Queue · 0 waiting",
            which reads as broken rather than empty. The Waitlist tile above is
            the way in until there's something to report. */}
        {hasScope("queue") && (queue?.isOpen || (queue?.waiting.length ?? 0) > 0) && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="card" style={{ padding: 14, border: queue?.isOpen ? "1px solid var(--blue-200)" : undefined }}>
              <div className="row gap-10 center-v">
                <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--amber-100)", color: "var(--amber-700)" }}>
                  <Users size={20} />
                </span>
                <div className="grow">
                  <div className="semi small">Queue · {queue?.waiting.length ?? 0} waiting</div>
                  <div className="tiny muted">{queue?.called.length ? `Serving ${queue.called[0].name}` : queue?.isOpen ? "Ready to call the next customer" : "Queue is currently off"}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => nav(`${base}/queue`)}>{t("manage")}</button>
              </div>
              {queue?.isOpen && (queue.waiting.length ?? 0) > 0 && (
                <button className="btn btn-primary btn-block btn-sm" style={{ marginTop: 10 }} disabled={busyId === "queue-call-next"} onClick={callNext}>
                  <Play size={15} /> Call next · {queue.waiting[0].name}
                </button>
              )}
            </div>
          </section>
        )}

        {hasScope("appointments") && ordersRightNow.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="row between center-v" style={{ marginBottom: 8 }}>
              <span className="small semi" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>{t("mdash_orders_right_now")}</span>
                <span className="badge badge-purple" style={{ fontSize: 10, padding: "1px 6px" }}>{ordersRightNow.length}</span>
              </span>
              <button type="button" className="see-all" onClick={() => nav(`${base}/deliveries`)}>
                {t("mdash_live_board")}
              </button>
            </div>
            <div className="col gap-10">
              {ordersRightNow.slice(0, 6).map((item) => (
                <DashboardOrderCard
                  key={item.id}
                  item={item}
                  businessId={id}
                  catalog={business?.catalog}
                  currentUserId={user.id}
                  preloadedDelivery={deliveryMap ? ((deliveryMap as Record<string, AppointmentDelivery>)[item.id] ?? null) : undefined}
                  busy={busyId === item.id}
                  packing={packingId === item.id}
                  onAccept={(ord) => updateAppointment(ord, "ACCEPTED")}
                  onAcceptAndPack={acceptAndPack}
                  onAcceptWithPayment={acceptWithPayment}
                  onDecline={(ord) => updateAppointment(ord, "REJECTED")}
                  onMarkPacked={markPacked}
                  onCompletePickup={(ord) => updateAppointment(ord, "COMPLETED")}
                  onPaymentDecision={updateAppointmentPayment}
                  onOpenLiveBoard={() => nav(`${base}/deliveries`)}
                  onOpenSelfRun={() => nav(`${base}/my-deliveries`)}
                  onOpenDetails={() => nav(`${base}/appointments?tab=deliveries`)}
                  onDeliveryChanged={() => {
                    refetchAppointments();
                    refetchDeliveryMap();
                  }}
                />
              ))}
              {ordersRightNow.length > 6 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm btn-block"
                  onClick={() => nav(`${base}/appointments?tab=deliveries`)}
                >
                  {tf("mdash_view_all_orders", { n: ordersRightNow.length })}
                </button>
              )}
            </div>
          </section>
        )}

        {(tools.appointments || tools.queue || tools.leads || tools.catalog) && (() => {
          const triageError = !!(appointmentsError || queueError || customError || bulkError || questionsError);
          const triageLoading = (appointmentsLoading && !appointments) || (queueLoading && !queue) || (customLoading && !customPayments) || (bulkLoading && !pendingBulkDeposits) || (questionsLoading && !questions);
          const hasAnyActionData = !!(appointments || queue || customPayments || pendingBulkDeposits || questions);
          const refetchTriage = () => {
            refetchAppointments();
            refetchQueue();
            refetchCustom();
            refetchBulkDeposits();
            refetchQuestions();
          };
          const showCaughtUp = actionCount === 0 && ordersRightNow.length === 0 && !triageError;
          if (!triageLoading && !triageError && actionCount === 0 && !showCaughtUp && !(isOwner && (reviews?.length ?? 0) > 0)) {
            return null;
          }

          return (
            <section className="page-pad" style={{ paddingTop: 0 }}>
              {(actionCount > 0 || showCaughtUp || triageError || triageLoading) && (
                <div className="row between center-v" style={{ marginBottom: 8 }}>
                  <span className="small semi muted" style={{ textTransform: "uppercase", letterSpacing: .5 }}>{t("mdash_action_needed")}</span>
                  {actionCount > 0 && <span className="badge badge-amber">{actionCount}</span>}
                </div>
              )}

              {triageError && !hasAnyActionData ? (
                <div className="card col center gap-8" style={{ padding: 18 }}>
                  <span className="small muted">Couldn't load pending action items</span>
                  <button className="btn btn-outline btn-sm" onClick={refetchTriage}>Retry</button>
                </div>
              ) : triageLoading && !hasAnyActionData ? (
                <div className="card col gap-8" style={{ padding: 14 }}>
                  <Skeleton h={16} w="60%" />
                  <Skeleton h={38} />
                </div>
              ) : (
                <>
                  {triageError && hasAnyActionData && (
                    <div className="row between center-v" style={{ padding: "8px 12px", marginBottom: 8, background: "var(--red-50)", border: "1px solid var(--red-200)", borderRadius: 10 }}>
                      <span className="tiny semi" style={{ color: "var(--red-700)" }}>Some action updates couldn't be refreshed.</span>
                      <button className="btn btn-ghost btn-xs" style={{ minHeight: 28 }} onClick={refetchTriage}>Retry</button>
                    </div>
                  )}

                  {showCaughtUp ? (
                    <div className="card col center" style={{ padding: 20, gap: 5 }}><span style={{ fontSize: 24 }}>✅</span><span className="tiny muted">{t("mdash_all_caught_up")}</span></div>
                  ) : actionCount === 0 && triageError ? (
                    <div className="card col center gap-8" style={{ padding: 18 }}>
                      <span className="small muted">Couldn't verify pending actions</span>
                      <button className="btn btn-outline btn-sm" onClick={refetchTriage}>Retry</button>
                    </div>
                  ) : actionCount > 0 ? (
                    <div className="col gap-10">
                      {isOwner && customClaims.length > 0 && (
                        <button type="button" className="card row gap-10 center-v" style={{ padding: 14, textAlign: "start" }} onClick={() => nav(`${base}/payments`)}>
                          <Wallet size={18} aria-hidden="true" />
                          <span className="semi small grow">{t("bdial_payments")}</span>
                          <span className="badge badge-amber">{customClaims.length}</span>
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      )}
                      {hasScope("appointments") && pendingBookings.slice(0, 3).map((item) => (
                        <TodayAction
                          key={`appointment-${item.id}`}
                          icon={<Calendar size={18} color="var(--brand-600)" />}
                          title={`${ownerVisibleCustomerName(item)} · ${item.timeLabel}`}
                          subtitle={item.packageName ?? item.dateLabel}
                          content={item.notes ? <div className="tiny muted" style={{ fontStyle: "italic" }}>📝 {item.notes}</div> : undefined}
                        >
                          <button className="btn btn-green btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointment(item, "ACCEPTED")}><Check size={14} /> {t("notif_apt_accept")}</button>
                          <button className="btn btn-outline btn-sm" disabled={busyId === item.id} onClick={() => updateAppointment(item, "REJECTED")}><XIcon size={14} /> {t("notif_apt_decline")}</button>
                        </TodayAction>
                      ))}

                      {hasScope("appointments") && standaloneAppointmentClaims.slice(0, 3).map((item) => (
                        <TodayAction
                          key={`appointment-payment-${item.id}`}
                          icon={<Wallet size={18} color="var(--amber-600)" />}
                          title={tf("mdash_claims_row", { name: ownerVisibleCustomerName(item), amount: inr(item.paymentAmount ?? item.packagePrice ?? 0) })}
                          subtitle={
                            item.paymentReference
                              ? tf("mdash_ref_code", { ref: item.paymentReference })
                              : t(claimContextKey(item))
                          }
                        >
                          <button className="btn btn-green btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointmentPayment(item, true)}>{t("confirm")}</button>
                          <button className="btn btn-outline btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointmentPayment(item, false)}>{t("mdash_reject")}</button>
                        </TodayAction>
                      ))}

                      {hasScope("queue") && queueClaims.slice(0, 3).map((item) => (
                        <TodayAction key={`queue-payment-${item.id}`} icon={<Wallet size={18} color="var(--amber-600)" />} title={`${item.name} claims ${inr(item.paymentAmount ?? 0)}`} subtitle={t("mdash_queue_payment")}>
                          <button className="btn btn-green btn-sm grow" disabled={busyId === item.id} onClick={() => updateQueuePayment(item, true)}>{t("confirm")}</button>
                          <button className="btn btn-outline btn-sm grow" disabled={busyId === item.id} onClick={() => updateQueuePayment(item, false)}>{t("mdash_reject")}</button>
                        </TodayAction>
                      ))}

                      {hasScope("catalog") && bulkDepositClaims.slice(0, 3).map((item) => (
                        <TodayAction key={`bulk-deposit-${item.id}`} icon={<Wallet size={18} color="var(--amber-600)" />} title={`${item.pledgerName || "A pledger"} claims ${inr(item.depositAmount ?? 0)}`} subtitle={item.dealTitle}>
                          <button className="btn btn-green btn-sm grow" disabled={busyId === item.userId} onClick={() => updateBulkDeposit(item, true)}>{t("confirm")}</button>
                          <button className="btn btn-outline btn-sm grow" disabled={busyId === item.userId} onClick={() => updateBulkDeposit(item, false)}>{t("mdash_reject")}</button>
                        </TodayAction>
                      ))}

                      {hasScope("leads") && unanswered.slice(0, 2).map((question) => (
                        <div key={question.id} className="card" style={{ padding: 14 }}>
                          <div className="row gap-10 center-v"><HelpCircle size={18} color="var(--blue-500)" /><div className="grow"><div className="semi small">{question.question}</div><div className="tiny muted">Asked by {question.askerName}</div></div></div>
                          {answeringId === question.id ? (
                            <div style={{ marginTop: 10 }}><textarea className="input" rows={2} value={answer} autoFocus placeholder={t("mdash_answer_placeholder")} onChange={(event) => setAnswer(event.target.value)} /><div className="row gap-8" style={{ marginTop: 8 }}><button className="btn btn-ghost btn-sm grow" onClick={() => { setAnsweringId(null); setAnswer(""); }}>{t("cancel")}</button><button className="btn btn-primary btn-sm grow" disabled={busyId === question.id || answer.trim().length < 2} onClick={() => postAnswer(question)}>{t("mdash_post_answer")}</button></div></div>
                          ) : <button className="btn btn-outline btn-sm btn-block" style={{ marginTop: 10 }} onClick={() => { setAnsweringId(question.id); setAnswer(""); }}>{t("mdash_answer_now")}</button>}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
              {isOwner && (reviews?.length ?? 0) > 0 && <button className="card row gap-10 center-v" style={{ width: "100%", marginTop: 10, textAlign: "left" }} onClick={() => nav(`${base}/reviews`)}><Star size={18} color="var(--amber-500)" /><span className="small semi grow">{t("mdash_reviews_link")}</span><ChevronRight size={17} color="var(--ink-300)" /></button>}
            </section>
          );
        })()}

        {hasScope("appointments") && todayAppointments.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="row between center-v" style={{ marginBottom: 8 }}><span className="small semi">{t("mdash_todays_appointments")}</span><button className="see-all" onClick={() => nav(`${base}/appointments`)}>{t("mdash_view_all")}</button></div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {todayAppointments.slice(0, 3).map((item, index) => (
                <button key={item.id} className="row gap-10 center-v" style={{ width: "100%", padding: "12px 14px", textAlign: "left", borderTop: index ? "1px solid var(--line)" : "none" }} onClick={() => nav(`${base}/appointments`)}>
                  <span className="semi small" style={{ color: "var(--brand-700)", minWidth: 70 }}>{item.timeLabel}</span><div className="grow"><div className="semi small">{ownerVisibleCustomerName(item)}</div><div className="tiny muted">{item.packageName ?? "Booking"}</div></div><ChevronRight size={16} color="var(--ink-300)" />
                </button>
              ))}
            </div>
          </section>
        )}

        {hasScope("appointments") && upcomingList.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="row between center-v" style={{ marginBottom: 8 }}><span className="small semi">{t("mdash_upcoming")}</span><button className="see-all" onClick={() => nav(`${base}/appointments`)}>{t("mdash_view_all")}</button></div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {upcomingList.map((item, index) => (
                <button key={item.id} className="row gap-10 center-v" style={{ width: "100%", padding: "12px 14px", textAlign: "left", borderTop: index ? "1px solid var(--line)" : "none" }} onClick={() => nav(`${base}/appointments`)}>
                  <div className="col" style={{ minWidth: 78, gap: 1 }}>
                    <span className="semi small" style={{ color: "var(--brand-700)" }}>{item.dateLabel}</span>
                    <span className="tiny muted">{item.timeLabel}</span>
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="semi small">{ownerVisibleCustomerName(item)}</div>
                    <div className="tiny muted">{item.packageName ?? "Booking"}</div>
                  </div>
                  <ChevronRight size={16} color="var(--ink-300)" />
                </button>
              ))}
            </div>
          </section>
        )}

        {isOwner && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <button className="card row gap-12 center-v" style={{ width: "100%", textAlign: "left" }} onClick={() => nav(`${base}/payments`)}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--green-100)", display: "grid", placeItems: "center" }}><Wallet size={20} color="var(--green-600)" /></span>
              <div className="grow"><div className="semi small">Payments · {paidRecords.length} confirmed</div><div className="tiny muted">{recordedPaid > 0 ? `${inr(recordedPaid)} recorded · ` : ""}{paymentClaims} to confirm</div></div><ChevronRight size={18} color="var(--ink-300)" />
            </button>
          </section>
        )}

        {hasScope("leads") && matchingRequests.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <button className="card row gap-12 center-v" style={{ width: "100%", textAlign: "left", background: "var(--orange-50)" }} onClick={() => nav(`${base}/requests`)}><Search size={20} color="var(--orange-600)" /><div className="grow"><div className="semi small">{matchingRequests.length} nearby request{matchingRequests.length === 1 ? "" : "s"} match you</div><div className="tiny muted">{t("mdash_send_proposal")}</div></div><ChevronRight size={18} color="var(--orange-500)" /></button>
          </section>
        )}

        {isOwner && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="small semi muted" style={{ marginBottom: 8 }}>{t("mdash_grow")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <GrowAction icon={<Megaphone size={18} color="var(--brand-600)" />} label={t("mdash_post_update")} onClick={() => nav("/community/new", { state: composeState })} />
              <GrowAction icon={<Camera size={18} color="var(--pink-500)" />} label={t("mdash_post_story")} onClick={() => nav("/story/new", { state: composeState })} />
              <GrowAction icon={<QrCode size={18} color="var(--ink-700)" />} label={t("mdash_share_qr")} onClick={() => setShare(true)} />
              {!business?.isVerified && <GrowAction icon={<BadgeCheck size={18} color="var(--green-600)" />} label={t("mdash_get_verified")} onClick={() => nav(`${base}/verify`)} />}
            </div>
          </section>
        )}
        <div style={{ height: 20 }} />
      </div>

      <ManageNav bizId={id} />
      {share && (
        <ShareCard
          subjects={{
            kind: "business",
            id,
            // Reached only through BusinessAccessGuard, so the viewer manages
            // this shop by definition — counter stand and payment QR apply.
            viewerManages: true,
            upiId: business?.upiId || undefined,
            paymentQrUrl: localStorage.getItem(`stryt_upi_qr_${id}`) || undefined,
            title: business?.name || "Business",
            subtitle: `${business?.subCategory || "Local business"} · ${business?.city || "STRYT"}`,
            image: business?.coverImage || "",
            meta: `⭐ ${business?.ratingAvg || 0} (${business?.ratingCount || 0})`,
          }}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

function TodayAction({
  icon,
  title,
  subtitle,
  badge,
  content,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  content?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card col gap-8" style={{ padding: 14 }}>
      <div className="row gap-10 center-v">
        {icon}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between center-v">
            <div className="semi small ellipsis">{title}</div>
            {badge}
          </div>
          <div className="tiny muted">{subtitle}</div>
        </div>
      </div>
      {content}
      <div className="row gap-8" style={{ marginTop: content ? 6 : 10 }}>{children}</div>
    </div>
  );
}

function GrowAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className="card row gap-10 center-v" style={{ padding: 12, textAlign: "left" }} onClick={onClick}>{icon}<span className="tiny semi grow">{label}</span></button>;
}
