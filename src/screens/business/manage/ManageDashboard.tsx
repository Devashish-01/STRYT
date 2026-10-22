import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BadgeCheck, Calendar, Camera, Check, ChevronRight, HelpCircle,
  Megaphone, Play, QrCode, Search, Star,
  Users, Wallet, X as XIcon, Zap,
} from "@/components/Icons";
import {
  appointmentService, businessService, bulkService, deliveryService, bustBusinessGetCache, communityService,
  customPaymentService, notificationService, requestService,
} from "@/services";
import { chatService } from "@/services/engagement/chatService";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import { useQuery, useQueryWithRealtime, invalidateQueryCache } from "@/hooks/useApi";
import { AppBar } from "@/components/common";
import { inr } from "@/lib/format";
import { ErrorView, Skeleton } from "@/components/states";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import type { AppointmentRecord, QnaItem, QueueOwnerToken, RequestPost } from "@/types";
import { deriveMoneySummary } from "@/utils/paymentSummary";
import ManageNav from "./ManageNav";
import BusinessConsoleHeader from "@/components/console/BusinessConsoleHeader";
import { buildBusinessCapabilities, todaysAppointments, upcomingAppointments } from "@/features/business-home/capabilities";
import { useShopOpenToggle } from "@/features/business-home/useShopOpenToggle";
import ShareCard from "@/components/ShareCard";
import { AccountStatusBanner } from "@/components/AccountStatusBanner";
import { SetupChecklist } from "@/components/SetupChecklist";
import { BUSINESS_PACKAGES, resolvePackage } from "@/lib/businessPackages";
import { buildConsoleSteps, consoleFor } from "@/lib/consoleSteps";
import Toggle from "@/components/Toggle";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { useBusinessAccess } from "@/lib/businessAccess";
import { errorMessage } from "@/lib/errorMessage";

export default function ManageDashboard() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, user } = useApp();
  const { t, tf } = useI18n();
  const ambient = useAmbientTheme(user.lat, user.lng, "business");
  // TMA-006 — no RequireScope on this route: it sits directly under
  // BusinessAccessGuard and self-hides by scope. Anything added here is
  // visible to EVERY grantee unless explicitly gated on hasScope()/isOwner.
  const { isOwner, hasScope, consoleMode, scopeLabel } = useBusinessAccess();
  const base = `/business/${id}/manage`;
  const [share, setShare] = useState(false);
  const [accepting, setAccepting] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const { data: business, loading: businessLoading, refetch: refetchBusiness } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const { available, toggle: toggleAvailability } = useShopOpenToggle(id, business, refetchBusiness);
  const { data: posts } = useQuery(() => communityService.byAuthorRef("business", id), [id], `business:${id}:posts`);
  // Orders accepted for delivery that nobody is carrying yet; empty (never an error) on a database without 20261001.
  const { data: awaitingDeliveries } = useQuery(
    () => ((DELIVERY_AGENT_ENABLED && business?.deliveryEnabled === true) ? deliveryService.awaitingDriver(id).catch(() => []) : Promise.resolve([] as Awaited<ReturnType<typeof deliveryService.awaitingDriver>>)),
    [id, (DELIVERY_AGENT_ENABLED && business?.deliveryEnabled === true)],
    `delivery:awaiting:${id}`,
  );
  const waitingForRider = (awaitingDeliveries ?? []).length;
  const { data: queue, refetch: refetchQueue } = useQueryWithRealtime(
    () => businessService.queueOwnerState(id), "queue_tokens", [id], `business_id=eq.${id}`, `queue:${id}`,
  );
  const { data: appointments, refetch: refetchAppointments } = useQueryWithRealtime(
    () => appointmentService.listForTarget(id), "appointments", [id], `target_id=eq.${id}`, `business:${id}:appointments-owner`,
  );
  const { data: customPayments } = useQueryWithRealtime(
    () => customPaymentService.listForTarget("BUSINESS", id), "custom_payments", [id], `target_id=eq.${id}`, `business:${id}:custom-payments`,
  );
  const { data: pendingBulkDeposits, refetch: refetchBulkDeposits } = useQueryWithRealtime(
    () => bulkService.pendingDepositsForBusiness(id), "bulk_deal_pledges", [id], undefined, `business:${id}:bulk-deposits`,
  );
  const { data: questions, refetch: refetchQuestions } = useQueryWithRealtime<QnaItem[]>(
    () => businessService.qna(id) as Promise<QnaItem[]>, "business_qna", [id], `business_id=eq.${id}`, `business:${id}:qna`,
  );
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

  // Watched as fields, not as the object: `business` gets a new identity on every refetch, and
  // re-running these then would reset a toggle the owner just flipped, before the server echoes it
  // back. `businessLoaded` only ever changes together with `businessId`, so it adds no re-runs.
  const businessId = business?.id;
  const businessLoaded = business != null;
  const businessOpenNow = business?.isOpenNow;

  useEffect(() => {
    if (!businessLoaded) return;
    setAccepting(businessOpenNow ?? true);
  }, [businessId, businessLoaded, businessOpenNow]);

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

  const appts = (appointments ?? []) as AppointmentRecord[];
  const pendingAppointments = appts.filter((item) => item.status === "PENDING");
  const queueTokens: QueueOwnerToken[] = [
    ...(queue?.waiting ?? []), ...(queue?.called ?? []), ...(queue?.served ?? []),
  ];
  const { appointmentClaims, queueClaims, customClaims, paymentClaims, paidRecords, recordedAmount: recordedPaid } = deriveMoneySummary(appts, queueTokens, customPayments ?? []);
  const unanswered = (questions ?? []).filter((item) => !item.answer);
  const bulkDepositClaims = pendingBulkDeposits ?? [];
  // Scoped to what this session can actually act on — a team member without
  // 'appointments' shouldn't see a badge count that includes booking claims
  // they can't open (the items themselves are filtered the same way below).
  const actionCount =
    // customClaims scoped the same as appointmentClaims: select_custom_payments
    // RLS requires 'appointments' scope for a delegate, so gate the badge to match.
    (hasScope("appointments") ? pendingAppointments.length + appointmentClaims.length + customClaims.length : 0) +
    (hasScope("queue") ? queueClaims.length : 0) +
    (hasScope("leads") ? unanswered.length : 0) +
    // bulk-deal management sits under the 'catalog' scope (write_bulk_deals'
    // own RLS check), matching BulkDealsManager's own access gate.
    (hasScope("catalog") ? bulkDepositClaims.length : 0);
  const range = business?.broadcastRadius ?? 5;
  // Read-only reach shown in the header; editing lives on the dedicated
  // Service radius screen (Business hub) now, not on this dashboard.
  const radiusLabel = range >= 5000 ? "🌍 Worldwide" : range === 0.5 ? "500 m" : `${range} km`;
  const matchingRequests = ((requestFeed?.data ?? []) as RequestPost[])
    .filter((item) => item.status === "OPEN")
    .filter((item) => !item.categoryId || !business?.categoryId || item.categoryId === business.categoryId)
    .filter((item) => !item.lat || !item.lng || item.distanceKm <= range);

  const todayAppointments = todaysAppointments(appts);
  const upcomingList = upcomingAppointments(appts);

  // Business Packages — the console's own vocabulary and shape. A restaurant
  // gets "Add your first 3 dishes" and a Menu/Reservations/Waitlist tile row;
  // an unmapped ("Plain page") business keeps exactly the wording it had. This
  // screen never branches on the package key — it only supplies what each
  // capability DOES, and the package decides which ones appear and in what
  // order. See src/lib/businessPackages.ts's header rule.
  const pkg = BUSINESS_PACKAGES[resolvePackage(business ?? {})];
  const consoleCfg = consoleFor(pkg);
  // Structural "does this business take bookings at all", distinct from
  // `isOpenNow` (a temporary pause). Same inherit expression BusinessDetail
  // already uses — a takeaway shouldn't be shown a reservations console.
  const bookingsOn = business?.bookingsEnabled ?? pkg.bookingsDefault;
  // Was driven purely by the business's own setting — with the flag off,
  // this tile stayed as an unguarded, discoverable path back into the
  // (now separately gated) BusinessDeliveries route.
  const deliveryOn = DELIVERY_AGENT_ENABLED && business?.deliveryEnabled === true;

  const composeState = {
    businessId: id,
    businessName: business?.name,
    businessAvatar: business?.coverImage,
  };

  const capabilities = buildBusinessCapabilities({
    base, nav, business, pkg, hasScope, bookingsOn, deliveryOn, waitingForRider, queue,
    upcomingCount: upcomingList.length, paymentClaims, postsCount: posts?.length ?? 0, composeState, tf,
  });

  const checklistItems = buildConsoleSteps(consoleCfg.setup, capabilities);

  // "Accepting appointments" (businesses.is_open_now) — distinct from the
  // "open now" presence toggle above: this one actually stops new bookings,
  // gated client-side (BusinessDetail) and server-side (appointment_create).
  async function toggleAccepting() {
    const previous = accepting;
    const next = !accepting;
    setAccepting(next);
    try {
      await businessService.update(id, { isOpenNow: next });
      showToast(next ? "Now accepting appointments" : "Paused — customers can't book new appointments");
      invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
      void refetchBusiness();
    } catch (error) {
      setAccepting(previous);
      const msg = String(errorMessage(error, ""));
      showToast(msg.includes("has_business_full_access")
        ? "Couldn't save — database permissions need updating (migration 20260842)"
        : msg || "Couldn't update appointment setting");
    }
  }

  async function updateAppointment(item: AppointmentRecord, status: "ACCEPTED" | "REJECTED") {
    setBusyId(item.id);
    try {
      await appointmentService.updateStatus(item.id, status);
      showToast(status === "ACCEPTED" ? "Appointment accepted" : "Appointment declined");
      refetchAppointments();
    } catch {
      showToast(t("mdash_appointment_failed"));
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
        consoleMode={consoleMode}
        ambient={ambient}
        subtitle={headerSubtitle}
        notificationUnread={notificationUnread ?? 0}
        chatUnread={chatUnread ?? 0}
        onShare={() => setShare(true)}
      />

      <div className="screen-scroll">
        {isOwner && (
          <div style={{ paddingTop: 12 }}>
            <AccountStatusBanner entityType="BUSINESS" entityId={id} status={business?.status} rejectionReason={business?.rejectionReason} />
          </div>
        )}

        {business && isOwner && (
          <section className="page-pad" style={{ paddingTop: 4 }}>
            <SetupChecklist title={consoleCfg.setupTitle} items={checklistItems} storageKey={`stryt_checklist_dismissed_${id}`} />
          </section>
        )}

        {isOwner && (
          <section className="page-pad">
            <button aria-pressed={available} className="card row gap-12 center-v" onClick={toggleAvailability} style={{ width: "100%", textAlign: "left", border: available ? "2px solid var(--green-500)" : "1px solid var(--line)" }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: available ? "var(--green-100)" : "var(--ink-50)" }}>
                <Zap size={21} color={available ? "var(--green-600)" : "var(--ink-400)"} weight={available ? "fill" : "regular"} />
              </span>
              <div className="grow"><div className="semi small">{available ? t("mdash_open_now") : t("mdash_mark_open")}</div><div className="tiny muted">{t("mdash_visible_nearby")}</div></div>
              <Toggle on={available} />
            </button>
            {/* Only for businesses that structurally take bookings. A takeaway
                (bookingsDefault false) was previously shown this toggle plus a
                whole appointments console it can't use. */}
            {bookingsOn && (
              <button aria-pressed={accepting} className="card row gap-12 center-v" onClick={toggleAccepting} style={{ width: "100%", textAlign: "left", marginTop: 10, border: accepting ? "1px solid var(--line)" : "2px solid var(--red-400)" }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: accepting ? "var(--ink-50)" : "var(--red-100)" }}>
                  <Calendar size={21} color={accepting ? "var(--ink-400)" : "var(--red-600)"} />
                </span>
                <div className="grow"><div className="semi small">Accepting {pkg.vocabulary.nounPlural}</div><div className="tiny muted">{accepting ? "Customers can book you right now" : "Paused — new bookings are turned off"}</div></div>
                <Toggle on={accepting} />
              </button>
            )}
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

        {(hasScope("appointments") || hasScope("queue") || hasScope("leads")) && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="row between center-v" style={{ marginBottom: 8 }}>
              <span className="small semi muted" style={{ textTransform: "uppercase", letterSpacing: .5 }}>{t("mdash_action_needed")}</span>
              {actionCount > 0 && <span className="badge badge-amber">{actionCount}</span>}
            </div>
            {actionCount === 0 ? (
              <div className="card col center" style={{ padding: 20, gap: 5 }}><span style={{ fontSize: 24 }}>✅</span><span className="tiny muted">{t("mdash_all_caught_up")}</span></div>
            ) : (
              <div className="col gap-10">
                {hasScope("appointments") && pendingAppointments.slice(0, 3).map((item) => (
                  <TodayAction key={`appointment-${item.id}`} icon={<Calendar size={18} color="var(--brand-600)" />} title={`${ownerVisibleCustomerName(item)} · ${item.timeLabel}`} subtitle={item.packageName ?? item.dateLabel}>
                    <button className="btn btn-green btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointment(item, "ACCEPTED")}><Check size={14} /> {t("notif_apt_accept")}</button>
                    <button className="btn btn-outline btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointment(item, "REJECTED")}><XIcon size={14} /> {t("notif_apt_decline")}</button>
                  </TodayAction>
                ))}

                {hasScope("appointments") && appointmentClaims.slice(0, 3).map((item) => (
                  <TodayAction key={`appointment-payment-${item.id}`} icon={<Wallet size={18} color="var(--amber-600)" />} title={`${ownerVisibleCustomerName(item)} claims ${inr(item.paymentAmount ?? item.packagePrice ?? 0)}`} subtitle={item.paymentReference ? `Reference ${item.paymentReference}` : "Appointment payment"}>
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
            )}
            {isOwner && (reviews?.length ?? 0) > 0 && <button className="card row gap-10 center-v" style={{ width: "100%", marginTop: 10, textAlign: "left" }} onClick={() => nav(`${base}/reviews`)}><Star size={18} color="var(--amber-500)" /><span className="small semi grow">{t("mdash_reviews_link")}</span><ChevronRight size={17} color="var(--ink-300)" /></button>}
          </section>
        )}

        {bookingsOn && hasScope("appointments") && todayAppointments.length > 0 && (
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

        {bookingsOn && hasScope("appointments") && upcomingList.length > 0 && (
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

      <ManageNav bizId={id} waitingCount={queue?.waiting.length ?? 0} />
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

function TodayAction({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="card" style={{ padding: 14 }}><div className="row gap-10 center-v">{icon}<div className="grow"><div className="semi small">{title}</div><div className="tiny muted">{subtitle}</div></div></div><div className="row gap-8" style={{ marginTop: 10 }}>{children}</div></div>;
}

function GrowAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className="card row gap-10 center-v" style={{ padding: 12, textAlign: "left" }} onClick={onClick}>{icon}<span className="tiny semi grow">{label}</span></button>;
}
