import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BadgeCheck, Bell, Calendar, Camera, Check, ChevronRight, HelpCircle,
  Megaphone, MessageSquareText, Play, QrCode, Search, Share2, Star,
  Wallet, X as XIcon, Zap,
} from "@/components/Icons";
import {
  appointmentService, businessService, communityService, notificationService,
  requestService,
} from "@/services";
import { chatService } from "@/services/engagement/chatService";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { AppBar, SafeImg, inr } from "@/components/common";
import { ErrorView, Skeleton } from "@/components/states";
import { useApp } from "@/store";
import type { AppointmentRecord, QnaItem, QueueOwnerToken, RequestPost } from "@/types";
import {
  calculateNextTurnoffTime, DEFAULT_ONBOARD_WORKING_HOURS,
  evaluateProviderAvailability,
} from "@/utils/availability";
import { deriveMoneySummary } from "@/utils/paymentSummary";
import ManageNav from "./ManageNav";
import ShareCard from "@/components/ShareCard";
import RoleSwitcher from "@/components/RoleSwitcher";
import BrandHome from "@/components/BrandHome";
import { AccountStatusBanner } from "@/components/AccountStatusBanner";
import { SetupChecklist } from "@/components/SetupChecklist";
import Toggle from "@/components/Toggle";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import AmbientSky from "@/features/ambient/AmbientSky";
import { useBusinessAccess } from "@/components/BusinessAccessGuard";

export default function ManageDashboard() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast, user } = useApp();
  const ambient = useAmbientTheme(user.lat, user.lng, "business");
  const { isOwner, accessLevel, hasScope } = useBusinessAccess();
  const canSeeOwnerOnly = isOwner || accessLevel === "FULL";
  const base = `/business/${id}/manage`;
  const [share, setShare] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const { data: business, loading: businessLoading } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const { data: posts } = useQuery(() => communityService.byAuthorRef("business", id), [id]);
  const { data: queue, refetch: refetchQueue } = useQueryWithRealtime(
    () => businessService.queueOwnerState(id), "queue_tokens", [id], `business_id=eq.${id}`, `queue:${id}`,
  );
  const { data: appointments, refetch: refetchAppointments } = useQueryWithRealtime(
    () => appointmentService.listForTarget(id), "appointments", [id], `target_id=eq.${id}`,
  );
  const { data: questions, refetch: refetchQuestions } = useQueryWithRealtime<QnaItem[]>(
    () => businessService.qna(id) as Promise<QnaItem[]>, "business_qna", [id], `business_id=eq.${id}`,
  );
  const { data: reviews } = useQueryWithRealtime(
    () => businessService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`,
  );
  const { data: requestFeed } = useQueryWithRealtime(
    () => requestService.feed({
      lat: business?.lat ?? undefined,
      lng: business?.lng ?? undefined,
      radiusKm: business?.broadcastRadius ?? undefined,
    }),
    "requests",
    [business?.lat, business?.lng, business?.broadcastRadius],
  );
  const { data: notificationUnread } = useQueryWithRealtime(
    () => notificationService.getUnreadCount({ scope: "BUSINESS", id }), "notifications", [id], undefined, `notif:business:${id}`,
  );
  const { data: chatUnread } = useQueryWithRealtime(
    () => chatService.totalUnread({ scope: "BUSINESS", id }), "conversations", [id], undefined, `chat:business:${id}`,
  );

  useEffect(() => {
    if (business) setAvailable(business.isAvailableNow ?? false);
  }, [business]);

  useEffect(() => {
    if (!business?.boostedUntil || business.boostReminderSent) return;
    const hoursLeft = (new Date(business.boostedUntil).getTime() - Date.now()) / 3_600_000;
    if (hoursLeft > 0 && hoursLeft <= 24) {
      showToast("Your boost expires in less than 24h — renew to stay featured");
      businessService.markBoostReminderSent(id).catch(() => {});
    }
  }, [business?.boostedUntil, business?.boostReminderSent, id, showToast]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Home" />
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
        <AppBar title="Home" />
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
  const { appointmentClaims, queueClaims, paymentClaims, paidRecords, recordedAmount: recordedPaid } = deriveMoneySummary(appts, queueTokens);
  const unanswered = (questions ?? []).filter((item) => !item.answer);
  // Scoped to what this session can actually act on — a team member without
  // 'appointments' shouldn't see a badge count that includes booking claims
  // they can't open (the items themselves are filtered the same way below).
  const actionCount =
    (hasScope("appointments") ? pendingAppointments.length + appointmentClaims.length : 0) +
    (hasScope("queue") ? queueClaims.length : 0) +
    (hasScope("leads") ? unanswered.length : 0);
  const range = business?.broadcastRadius ?? 5;
  // Read-only reach shown in the header; editing lives on the dedicated
  // Broadcast radius screen (Business hub) now, not on this dashboard.
  const radiusLabel = range >= 5000 ? "🌍 Worldwide" : range === 0.5 ? "500 m" : `${range} km`;
  const matchingRequests = ((requestFeed?.data ?? []) as RequestPost[])
    .filter((item) => item.status === "OPEN")
    .filter((item) => !item.categoryId || !business?.categoryId || item.categoryId === business.categoryId)
    .filter((item) => !item.lat || !item.lng || item.distanceKm <= range);

  const today = new Date();
  const todayAppointments = appts
    .filter((item) => {
      if (item.status !== "PENDING" && item.status !== "ACCEPTED") return false;
      const date = new Date(item.scheduledForISO);
      return date.toDateString() === today.toDateString();
    })
    .sort((a, b) => +new Date(a.scheduledForISO) - +new Date(b.scheduledForISO));

  // Future days only — a booking whose date is strictly after today. Copy the
  // date first (setDate mutates) so today's own comparison above stays intact.
  const startOfTomorrow = new Date(today);
  startOfTomorrow.setHours(0, 0, 0, 0);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const upcomingAppointments = appts
    .filter((item) => {
      if (item.status !== "PENDING" && item.status !== "ACCEPTED") return false;
      return new Date(item.scheduledForISO).getTime() >= startOfTomorrow.getTime();
    })
    .sort((a, b) => +new Date(a.scheduledForISO) - +new Date(b.scheduledForISO))
    .slice(0, 5);

  const checklistItems = [
    { label: "Add a catalog item", done: (business?.catalog?.length ?? 0) > 0, onClick: () => nav(`${base}/catalog`) },
    { label: "Set your hours", done: !!business?.hours && business.hours !== DEFAULT_ONBOARD_WORKING_HOURS, onClick: () => nav(`${base}/hours`) },
    { label: "Upload verification", done: !!business?.verificationStatus, onClick: () => nav(`${base}/verify`) },
    { label: "Post your first update", done: (posts?.length ?? 0) > 0, onClick: () => nav("/community/new", { state: composeState }) },
  ];
  const availability = evaluateProviderAvailability(business?.hours, available, business?.availableUntil);

  async function toggleAvailability() {
    const previous = available;
    const next = !available;
    setAvailable(next);
    try {
      if (next && !availability.isOpenNow) {
        const until = calculateNextTurnoffTime(business?.hours);
        await businessService.setAvailability(id, true, until.toISOString());
        showToast(`Open now — clears at ${until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      } else {
        await businessService.setAvailability(id, next, null);
        showToast(next ? "Shop marked open right now" : "Shop marked closed");
      }
    } catch (error: any) {
      setAvailable(previous);
      showToast(error?.message ?? "Couldn't update availability");
    }
  }

  async function updateAppointment(item: AppointmentRecord, status: "ACCEPTED" | "REJECTED") {
    setBusyId(item.id);
    try {
      await appointmentService.updateStatus(item.id, status);
      showToast(status === "ACCEPTED" ? "Appointment accepted" : "Appointment declined");
      refetchAppointments();
    } catch {
      showToast("Couldn't update appointment");
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
    } catch (e: any) {
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
      showToast("Couldn't update queue payment");
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
      showToast(`Called ${next.name}`);
      refetchQueue();
    } catch (error: any) {
      showToast(error?.message ?? "Couldn't call next");
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
      showToast("Answer posted");
      refetchQuestions();
    } catch {
      showToast("Couldn't post answer");
    } finally {
      setBusyId(null);
    }
  }

  const composeState = {
    businessId: id,
    businessName: business?.name,
    businessAvatar: business?.coverImage,
  };

  return (
    <div className="screen with-nav">
      <header className="living-sky-header" style={{
        background: ambient.headerGradient, color: "#fff",
        padding: "calc(18px + var(--safe-area-top)) 16px 22px",
        borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
        position: "relative",
      }}>
        {/* Clips only the decorative sky layer — the header itself must NOT
            clip, or RoleSwitcher's dropdown (a sibling below) gets cut off
            the moment it's taller than the header. */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
          <AmbientSky dayPart={ambient.dayPartKey} effect={ambient.seasonEffect} glow={ambient.lampGlow} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="row between center-v">
            <BrandHome color="#fff" glow={ambient.lampGlow} />
            <div className="row gap-8 center-v">
              <RoleSwitcher theme="dark-pill" enableLongPress />
              <HeaderIcon label="Notifications" count={notificationUnread ?? 0} onClick={() => nav(`/notifications?scope=BUSINESS&id=${id}`)}>
                <Bell size={16} />
              </HeaderIcon>
              <HeaderIcon label="Messages" count={chatUnread ?? 0} onClick={() => nav(`/chats?scope=BUSINESS&id=${id}`)}>
                <MessageSquareText size={16} />
              </HeaderIcon>
              <button className="icon-btn-sm" aria-label="Share shop" onClick={() => setShare(true)} style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>
                <Share2 size={16} />
              </button>
            </div>
          </div>
          <div className="row gap-12 center-v" style={{ marginTop: 18 }}>
            <SafeImg src={business?.coverImage} variant="photo" style={{ width: 58, height: 58, borderRadius: 16, border: "2px solid rgba(255,255,255,.4)" }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6 center-v">
                <span className="bold h1 ellipsis" style={{ color: "#fff" }}>{business?.name ?? "Your business"}</span>
                {business?.isVerified && <BadgeCheck size={18} color="var(--accent-400)" weight="fill" />}
              </div>
              <div className="small" style={{ opacity: .9, color: "#fff" }}>{business?.subCategory || business?.categoryName || "Local business"}</div>
              <div className="tiny" style={{ opacity: .78, marginTop: 3, color: "#fff" }}>{ambient.greeting} · {business?.ratingAvg ?? 0}★ · 📡 {radiusLabel} reach</div>
            </div>
            <button className="tiny semi" style={{ color: "#fff", background: "rgba(255,255,255,.16)", padding: "7px 10px", borderRadius: 999 }} onClick={() => nav(`/business/${id}`)}>
              View shop
            </button>
          </div>
        </div>
      </header>

      <div className="screen-scroll">
        {canSeeOwnerOnly && (
          <div style={{ paddingTop: 12 }}>
            <AccountStatusBanner entityType="BUSINESS" entityId={id} status={business?.status} />
          </div>
        )}

        {business && canSeeOwnerOnly && (
          <section className="page-pad" style={{ paddingTop: 4 }}>
            <SetupChecklist title="Finish setting up your shop" items={checklistItems} storageKey={`stryt_checklist_dismissed_${id}`} />
          </section>
        )}

        {canSeeOwnerOnly && (
          <section className="page-pad">
            <button className="card row gap-12 center-v" onClick={toggleAvailability} style={{ width: "100%", textAlign: "left", border: available ? "2px solid var(--green-500)" : "1px solid var(--line)" }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: available ? "var(--green-100)" : "var(--ink-50)" }}>
                <Zap size={21} color={available ? "var(--green-600)" : "var(--ink-400)"} weight={available ? "fill" : "regular"} />
              </span>
              <div className="grow"><div className="semi small">{available ? "Open now" : "Mark shop open now"}</div><div className="tiny muted">Visible to nearby customers</div></div>
              <Toggle on={available} />
            </button>
          </section>
        )}

        {hasScope("queue") && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="card" style={{ padding: 14, border: queue?.isOpen ? "1px solid var(--blue-200)" : undefined }}>
              <div className="row gap-10 center-v">
                <span style={{ fontSize: 23 }}>👥</span>
                <div className="grow">
                  <div className="semi small">Queue · {queue?.waiting.length ?? 0} waiting</div>
                  <div className="tiny muted">{queue?.called.length ? `Serving ${queue.called[0].name}` : queue?.isOpen ? "Ready to call the next customer" : "Queue is currently off"}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => nav(`${base}/queue`)}>Manage</button>
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
              <span className="small semi muted" style={{ textTransform: "uppercase", letterSpacing: .5 }}>Action needed</span>
              {actionCount > 0 && <span className="badge badge-amber">{actionCount}</span>}
            </div>
            {actionCount === 0 ? (
              <div className="card col center" style={{ padding: 20, gap: 5 }}><span style={{ fontSize: 24 }}>✅</span><span className="tiny muted">You're all caught up.</span></div>
            ) : (
              <div className="col gap-10">
                {hasScope("appointments") && pendingAppointments.slice(0, 3).map((item) => (
                  <TodayAction key={`appointment-${item.id}`} icon={<Calendar size={18} color="var(--brand-600)" />} title={`${ownerVisibleCustomerName(item)} · ${item.timeLabel}`} subtitle={item.packageName ?? item.dateLabel}>
                    <button className="btn btn-green btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointment(item, "ACCEPTED")}><Check size={14} /> Accept</button>
                    <button className="btn btn-outline btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointment(item, "REJECTED")}><XIcon size={14} /> Decline</button>
                  </TodayAction>
                ))}

                {hasScope("appointments") && appointmentClaims.slice(0, 3).map((item) => (
                  <TodayAction key={`appointment-payment-${item.id}`} icon={<Wallet size={18} color="var(--amber-600)" />} title={`${ownerVisibleCustomerName(item)} claims ${inr(item.paymentAmount ?? item.packagePrice ?? 0)}`} subtitle={item.paymentReference ? `Reference ${item.paymentReference}` : "Appointment payment"}>
                    <button className="btn btn-green btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointmentPayment(item, true)}>Confirm</button>
                    <button className="btn btn-outline btn-sm grow" disabled={busyId === item.id} onClick={() => updateAppointmentPayment(item, false)}>Reject</button>
                  </TodayAction>
                ))}

                {hasScope("queue") && queueClaims.slice(0, 3).map((item) => (
                  <TodayAction key={`queue-payment-${item.id}`} icon={<Wallet size={18} color="var(--amber-600)" />} title={`${item.name} claims ${inr(item.paymentAmount ?? 0)}`} subtitle="Queue payment">
                    <button className="btn btn-green btn-sm grow" disabled={busyId === item.id} onClick={() => updateQueuePayment(item, true)}>Confirm</button>
                    <button className="btn btn-outline btn-sm grow" disabled={busyId === item.id} onClick={() => updateQueuePayment(item, false)}>Reject</button>
                  </TodayAction>
                ))}

                {hasScope("leads") && unanswered.slice(0, 2).map((question) => (
                  <div key={question.id} className="card" style={{ padding: 14 }}>
                    <div className="row gap-10 center-v"><HelpCircle size={18} color="var(--blue-500)" /><div className="grow"><div className="semi small">{question.question}</div><div className="tiny muted">Asked by {question.askerName}</div></div></div>
                    {answeringId === question.id ? (
                      <div style={{ marginTop: 10 }}><textarea className="input" rows={2} value={answer} autoFocus placeholder="Type your answer…" onChange={(event) => setAnswer(event.target.value)} /><div className="row gap-8" style={{ marginTop: 8 }}><button className="btn btn-ghost btn-sm grow" onClick={() => { setAnsweringId(null); setAnswer(""); }}>Cancel</button><button className="btn btn-primary btn-sm grow" disabled={busyId === question.id || answer.trim().length < 2} onClick={() => postAnswer(question)}>Post answer</button></div></div>
                    ) : <button className="btn btn-outline btn-sm btn-block" style={{ marginTop: 10 }} onClick={() => { setAnsweringId(question.id); setAnswer(""); }}>Answer now</button>}
                  </div>
                ))}
              </div>
            )}
            {canSeeOwnerOnly && (reviews?.length ?? 0) > 0 && <button className="card row gap-10 center-v" style={{ width: "100%", marginTop: 10, textAlign: "left" }} onClick={() => nav(`${base}/reviews`)}><Star size={18} color="var(--amber-500)" /><span className="small semi grow">Reviews · reply to customers</span><ChevronRight size={17} color="var(--ink-300)" /></button>}
          </section>
        )}

        {hasScope("appointments") && todayAppointments.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="row between center-v" style={{ marginBottom: 8 }}><span className="small semi">Today's bookings</span><button className="see-all" onClick={() => nav(`${base}/appointments`)}>View all</button></div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {todayAppointments.slice(0, 3).map((item, index) => (
                <button key={item.id} className="row gap-10 center-v" style={{ width: "100%", padding: "12px 14px", textAlign: "left", borderTop: index ? "1px solid var(--line)" : "none" }} onClick={() => nav(`${base}/appointments`)}>
                  <span className="semi small" style={{ color: "var(--brand-700)", minWidth: 70 }}>{item.timeLabel}</span><div className="grow"><div className="semi small">{ownerVisibleCustomerName(item)}</div><div className="tiny muted">{item.packageName ?? "Booking"}</div></div><ChevronRight size={16} color="var(--ink-300)" />
                </button>
              ))}
            </div>
          </section>
        )}

        {hasScope("appointments") && upcomingAppointments.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="row between center-v" style={{ marginBottom: 8 }}><span className="small semi">Upcoming</span><button className="see-all" onClick={() => nav(`${base}/appointments`)}>View all</button></div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {upcomingAppointments.map((item, index) => (
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

        {canSeeOwnerOnly && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <button className="card row gap-12 center-v" style={{ width: "100%", textAlign: "left" }} onClick={() => nav(`${base}/payments`)}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--green-100)", display: "grid", placeItems: "center" }}><Wallet size={20} color="var(--green-600)" /></span>
              <div className="grow"><div className="semi small">Payments · {paidRecords.length} confirmed</div><div className="tiny muted">{recordedPaid > 0 ? `${inr(recordedPaid)} recorded · ` : ""}{paymentClaims} to confirm</div></div><ChevronRight size={18} color="var(--ink-300)" />
            </button>
          </section>
        )}

        {hasScope("leads") && matchingRequests.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <button className="card row gap-12 center-v" style={{ width: "100%", textAlign: "left", background: "var(--orange-50)" }} onClick={() => nav(`${base}/requests`)}><Search size={20} color="var(--orange-600)" /><div className="grow"><div className="semi small">{matchingRequests.length} nearby request{matchingRequests.length === 1 ? "" : "s"} match you</div><div className="tiny muted">Send a proposal to win the work</div></div><ChevronRight size={18} color="var(--orange-500)" /></button>
          </section>
        )}

        {canSeeOwnerOnly && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="small semi muted" style={{ marginBottom: 8 }}>Grow</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <GrowAction icon={<Megaphone size={18} color="var(--brand-600)" />} label="Post update" onClick={() => nav("/community/new", { state: composeState })} />
              <GrowAction icon={<Camera size={18} color="var(--pink-500)" />} label="Post story" onClick={() => nav("/story/new", { state: composeState })} />
              <GrowAction icon={<QrCode size={18} color="var(--ink-700)" />} label="Share QR" onClick={() => setShare(true)} />
              {!business?.isVerified && <GrowAction icon={<BadgeCheck size={18} color="var(--green-600)" />} label="Get verified" onClick={() => nav(`${base}/verify`)} />}
            </div>
          </section>
        )}
        <div style={{ height: 20 }} />
      </div>

      <ManageNav bizId={id} waitingCount={queue?.waiting.length ?? 0} />
      {share && <ShareCard title={business?.name || "Business"} subtitle={`${business?.subCategory || "Local business"} · ${business?.city || "STRYT"}`} image={business?.coverImage || ""} meta={`⭐ ${business?.ratingAvg || 0} (${business?.ratingCount || 0})`} url={`${window.location.origin}/business/${id}`} upiId={business?.upiId || undefined} paymentQrUrl={localStorage.getItem(`stryt_upi_qr_${id}`) || undefined} onClose={() => setShare(false)} />}
    </div>
  );
}

function HeaderIcon({ label, count, onClick, children }: { label: string; count: number; onClick: () => void; children: React.ReactNode }) {
  return <button className="icon-btn-sm" aria-label={label} onClick={onClick} style={{ background: "rgba(255,255,255,.16)", color: "#fff", position: "relative" }}>{children}{count > 0 && <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: "var(--red-500)" }} />}</button>;
}

function TodayAction({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="card" style={{ padding: 14 }}><div className="row gap-10 center-v">{icon}<div className="grow"><div className="semi small">{title}</div><div className="tiny muted">{subtitle}</div></div></div><div className="row gap-8" style={{ marginTop: 10 }}>{children}</div></div>;
}

function GrowAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className="card row gap-10 center-v" style={{ padding: 12, textAlign: "left" }} onClick={onClick}>{icon}<span className="tiny semi grow">{label}</span></button>;
}
