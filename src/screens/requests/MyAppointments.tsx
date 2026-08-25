import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg, PullToRefreshIndicator } from "@/components/common";
import { NoAppointmentsIllustration } from "@/components/illustrations";
import { appointmentService, businessService, providerService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import type { AppointmentRecord } from "@/types";
import { AppointmentSheet, type BookingPackage } from "@/components/AppointmentSheet";
import { evaluateProviderAvailability, DEFAULT_WORKING_HOURS } from "@/utils/availability";
import { Calendar, Image as ImageIcon, X as XIcon, CheckCircle2, RotateCcw, CalendarClock, CreditCard, Plus, Store } from "@/components/Icons";
import { PaymentSheet } from "@/components/PaymentSheet";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";
import { PhotoPreviewModal } from "@/components/appointments/PhotoPreviewModal";
import { CancelAttributionNote } from "@/components/appointments/CancelAttributionNote";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import DeliveryTrackControl from "@/components/delivery/DeliveryTrackControl";
import { loadDismissedCards, persistDismissedCards } from "@/lib/dismissedCards";
import { APPOINTMENT_STATUS_BADGE } from "@/lib/statusBadges";
import { haptics } from "@/lib/haptics";
import { resolvePackage, BUSINESS_PACKAGES, PACKAGE_KEYS, type BusinessPackageKey } from "@/lib/businessPackages";
import { useI18n } from "@/lib/i18n";

// A booking counts as "upcoming" while it is still live and in the future.
function isUpcoming(a: AppointmentRecord): boolean {
  const future = new Date(a.scheduledForISO).getTime() > Date.now();
  return (a.status === "PENDING" || a.status === "ACCEPTED") && future;
}

// Payment can be claimed/tracked at any of these stages: PENDING (seller may
// require payment before accepting), ACCEPTED (the normal pay-around-service
// case), or COMPLETED (an accepted appointment auto-completes once its slot
// passes — the payment step must not vanish just because that ran).
function isPayable(status: AppointmentRecord["status"]): boolean {
  return status === "PENDING" || status === "ACCEPTED" || status === "COMPLETED";
}

// A booking that can still be paid and still needs the customer to act: payable
// (PENDING/ACCEPTED/COMPLETED), not yet PAID, and not in a dead-end state
// (cancelled/declined/no-show). These are kept in Upcoming even after their slot
// passes so the payment step never silently drops into Past before it's done.
function isUnpaidActionable(a: AppointmentRecord): boolean {
  if (!isPayable(a.status)) return false;
  if (a.status === "CANCELLED" || a.status === "REJECTED" || a.status === "NO_SHOW") return false;
  return (a.paymentStatus ?? "UNPAID") !== "PAID";
}

// The Dismiss affordance is only for cards being *held back* in Upcoming past
// their slot time (unpaid-actionable but no longer genuinely upcoming) — e.g. a
// COMPLETED-but-unpaid booking. A normal future booking is cancelled, not
// dismissed, so it deliberately gets no Dismiss button.
function isDismissible(a: AppointmentRecord): boolean {
  return isUnpaidActionable(a) && !isUpcoming(a);
}

// Each row snapshots the target's package at booking time (see the
// target_package_key migration) — so a row keeps whatever wording it was
// booked with even if the business later changes package. No stored key
// (legacy rows, or the QR self-pay walk-in path) reads as "generic", i.e.
// today's exact "appointment" wording.
function vocabForRow(apt: AppointmentRecord) {
  const key = apt.targetPackageKey;
  const resolved = key && (PACKAGE_KEYS as string[]).includes(key) ? (key as BusinessPackageKey) : "generic";
  return BUSINESS_PACKAGES[resolved].vocabulary;
}

interface RebookTarget {
  apt: AppointmentRecord;
  mode: "RESCHEDULE" | "AGAIN";
  availabilityNote?: string;
  packages: BookingPackage[];
  availableNow: boolean;
  // Carried from the target so an AT_BOOKING seller can still collect (incl. a
  // deposit) on a reschedule / book-again — the sheet got none of these before.
  paymentTiming?: "AT_BOOKING" | "AT_APPOINTMENT";
  payeeUpiId?: string | null;
  depositPercent?: number;
  // The target's CURRENT resolved package (freshest info — may differ from
  // apt.targetPackageKey if the owner has changed it since the original
  // booking). Drives the sheet's own wording; a plain re-create (Book again)
  // stamps the new row with this, while a reschedule's row keeps the
  // ORIGINAL snapshot server-side regardless (same purchase, just retimed).
  targetPackageKey: BusinessPackageKey;
}

export default function MyAppointments() {
  const nav = useNavigate();
  const { user, showToast } = useApp();
  const { t, tf } = useI18n();
  const [tab, setTab] = useState<"UPCOMING" | "PAST">("UPCOMING");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [rebook, setRebook] = useState<RebookTarget | null>(null);
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null);
  const [payingApt, setPayingApt] = useState<AppointmentRecord | null>(null);
  const [payBizUpiId, setPayBizUpiId] = useState<string | null>(null);
  const [loadingPay, setLoadingPay] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(loadDismissedCards);
  const [cancelConfirm, setCancelConfirm] = useState<AppointmentRecord | null>(null);

  const { data, loading, error, refetch } = useQueryWithRealtime<AppointmentRecord[]>(
    () => appointmentService.listForCustomer(user.id),
    "appointments",
    [user.id],
    user.id ? `customer_user_id=eq.${user.id}` : undefined
  );

  const { upcomingList, pastList } = useMemo(() => {
    const all = data ?? [];
    // Upcoming = genuinely future live bookings PLUS any unpaid-actionable one
    // (even if its slot has passed), so the payment step can't vanish into Past.
    // Dismissed cards are hidden from Upcoming; Past follows the plain split so a
    // later-PAID booking still surfaces there as a normal historical record.
    const shouldBeUpcoming = (a: AppointmentRecord) => isUpcoming(a) || isUnpaidActionable(a);
    return {
      upcomingList: all.filter((a) => shouldBeUpcoming(a) && !dismissedIds.has(a.id)),
      pastList: all.filter((a) => !shouldBeUpcoming(a)),
    };
  }, [data, dismissedIds]);
  const list = tab === "UPCOMING" ? upcomingList : pastList;
  const upcomingCount = upcomingList.length;

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(refetch);

  async function cancel(apt: AppointmentRecord) {
    setCancelConfirm(null);
    setCancelling(apt.id);
    try {
      await appointmentService.updateStatus(apt.id, "CANCELLED", undefined, "CUSTOMER");
      haptics.warning();
      showToast(`${vocabForRow(apt).nounCap} cancelled`);
      refetch();
    } catch {
      showToast("Couldn't cancel. Try again.");
    } finally {
      setCancelling(null);
    }
  }

  // Local-only hide for a stuck unpaid card. Makes NO server change — the
  // booking is untouched; it just disappears from this device's lists
  // (persisted, so it stays gone across reloads).
  function dismissCard(apt: AppointmentRecord) {
    setDismissedIds((prev) => {
      const next = new Set(prev).add(apt.id);
      persistDismissedCards(next);
      return next;
    });
    showToast(`${vocabForRow(apt).nounCap} dismissed`);
  }

  // Load the target's live hours + packages, then open the booking sheet.
  async function openRebook(apt: AppointmentRecord, mode: "RESCHEDULE" | "AGAIN") {
    setLoadingTarget(apt.id);
    try {
      if (apt.targetType === "BUSINESS") {
        const b = await businessService.get(apt.targetId);
        if (!b) throw new Error("Shop unavailable");
        const availableNow = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
        setRebook({
          apt,
          mode,
          availabilityNote: b.hours || DEFAULT_WORKING_HOURS,
          packages: (b.catalog ?? []).map((it) => ({ id: it.id, name: it.name, price: it.salePrice ?? it.price })),
          availableNow,
          paymentTiming: b.paymentTiming,
          payeeUpiId: b.upiId ?? null,
          depositPercent: (b as any).depositPercent,
          targetPackageKey: resolvePackage(b),
        });
      } else {
        const p = await providerService.get(apt.targetId);
        if (!p) throw new Error("Provider unavailable");
        const availableNow = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow;
        setRebook({
          apt,
          mode,
          availabilityNote: p.availabilityNote,
          packages: (p.catalog ?? []).map((it) => ({ id: it.id, name: it.name, price: it.salePrice ?? it.price })),
          availableNow,
          paymentTiming: p.paymentTiming,
          payeeUpiId: p.upiId ?? null,
          depositPercent: (p as any).depositPercent,
          targetPackageKey: resolvePackage(p),
        });
      }
    } catch (e: any) {
      showToast(e?.message || "Couldn't open booking. Try again.");
    } finally {
      setLoadingTarget(null);
    }
  }

  async function openPay(apt: AppointmentRecord) {
    setLoadingPay(apt.id);
    try {
      let upiId: string | null = null;
      if (apt.targetType === "BUSINESS") {
        const biz = await businessService.get(apt.targetId);
        upiId = biz?.upiId ?? null;
      }
      setPayBizUpiId(upiId);
      setPayingApt(apt);
    } catch {
      showToast("Couldn't load payment info. Try again.");
    } finally {
      setLoadingPay(null);
    }
  }

  // Reschedule is now atomic on the server (reschedule_appointment cancels the
  // original and creates the new booking in a single transaction), so there's
  // no separate client-side cancel to run — which is what used to strand two
  // live bookings when that best-effort cancel silently failed.
  function handleBooked() {}

  return (
    <div className="screen screen-boxed">
      {/* Feedback #14 — there was no way to START a booking from this page,
          only to review existing ones. A customer can't create an appointment
          out of thin air (slots belong to a shop or provider), so "book" means
          "go find who you want to book with" — Explore is the honest target,
          not a form. */}
      <AppBar
        title={t("my_appointments_title")}
        subtitle={t("my_appointments_subtitle")}
        right={
          <button className="icon-btn" onClick={() => nav("/explore")} aria-label={t("book_new_appointment")} title={t("book_an_appointment")}>
            <Plus size={20} />
          </button>
        }
      />

      {/* Upcoming / Past tabs */}
      <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 6 }}>
        <button className={`chip ${tab === "UPCOMING" ? "active" : ""}`} onClick={() => setTab("UPCOMING")}>
          {t("upcoming_tab")}{upcomingCount > 0 ? ` (${upcomingCount})` : ""}
        </button>
        <button className={`chip ${tab === "PAST" ? "active" : ""}`} onClick={() => setTab("PAST")}>
          {t("past_cancelled_tab")}
        </button>
      </div>

      <div ref={containerRef} className="screen-scroll">
        <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} threshold={threshold} />
        {loading && <ListSkeleton count={3} type="appointment" />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
            {list.length === 0 ? (
              <EmptyState
                illustration={<NoAppointmentsIllustration />}
                emoji="📅"
                title={tab === "UPCOMING" ? t("no_upcoming_appointments") : t("nothing_here_yet")}
                text={tab === "UPCOMING" ? t("book_slot_shows_here") : t("past_bookings_appear_here")}
                action={tab === "UPCOMING" ? (
                  <button className="btn btn-primary row gap-6 center" onClick={() => nav("/explore")}>
                    <Store size={16} /> {t("find_place_to_book")}
                  </button>
                ) : undefined}
              />
            ) : (
              list.map((apt) => {
                const busy = cancelling === apt.id || loadingTarget === apt.id;
                const payable = isPayable(apt.status);
                return (
                  <div key={apt.id} className="card col gap-10 queue-row-enter" style={{ padding: 14 }}>
                    <div className="row between center-v">
                      <div>
                        <div className="bold small" style={{ color: "var(--ink-900)" }}>{apt.targetName}</div>
                        <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                          <Calendar size={12} color="var(--brand-600)" /> {apt.dateLabel} at {apt.timeLabel}
                        </div>
                      </div>
                      <div className="col gap-4" style={{ alignItems: "flex-end" }}>
                        <span
                          className={`badge ${APPOINTMENT_STATUS_BADGE[apt.status].cls}`}
                          style={{ fontSize: 10, padding: "3px 9px" }}
                        >
                          {APPOINTMENT_STATUS_BADGE[apt.status].label}
                        </span>
                        {payable && (
                          <span
                            className={`badge ${apt.paymentStatus === "PAID" ? "badge-green" : "badge-gray"}`}
                            style={{ fontSize: 9, padding: "2px 7px" }}
                          >
                            {apt.paymentStatus === "PAID" ? t("paid_status") : t("unpaid_status")}
                          </span>
                        )}
                      </div>
                    </div>

                    {(apt.packageName || apt.notes || apt.photoUrl) && (
                      <div className="col gap-6" style={{ background: "var(--ink-50)", padding: 10, borderRadius: 10 }}>
                        {apt.packageName && (
                          <div className="tiny semi" style={{ color: "var(--brand-700)" }}>
                            📦 {apt.packageName}{apt.packagePrice ? ` • ₹${apt.packagePrice}` : ""}
                          </div>
                        )}
                        {apt.notes && (
                          <div className="tiny" style={{ color: "var(--ink-700)" }}>
                            📝 <strong>{t("your_note_label")}</strong> {apt.notes}
                          </div>
                        )}
                        {apt.photoUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto(apt.photoUrl!)}
                            className="row gap-6 center-v"
                            style={{ background: "none", border: "none", color: "var(--brand-700)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}
                          >
                            <ImageIcon size={14} /> {t("view_reference_photo")}
                          </button>
                        )}
                      </div>
                    )}

                    <CancelAttributionNote apt={apt} viewpoint="CUSTOMER" />

                    {/* Delivery tracking — live link + handoff code. Feature-gated, and only
                        for bookings the customer actually asked to have delivered. */}
                    {DELIVERY_AGENT_ENABLED && apt.fulfillmentType === "DELIVERY" && (apt.status === "ACCEPTED" || apt.status === "COMPLETED") && (
                      <DeliveryTrackControl appointmentId={apt.id} />
                    )}

                    {/* Payment status — shown for PENDING too (seller may require
                        payment before accepting) and COMPLETED too (an accepted
                        appointment auto-completes once its slot passes; the payment
                        step must not disappear just because that housekeeping ran). */}
                    {payable && (
                      <PaymentStatusCard
                        paymentStatus={apt.paymentStatus}
                        paymentMethod={apt.paymentMethod}
                        paymentAmount={apt.paymentAmount}
                        paymentReference={apt.paymentReference}
                        claimantName="You"
                        viewerIsPayer
                      />
                    )}
                    {payable && (!apt.paymentStatus || apt.paymentStatus === "UNPAID" || apt.paymentStatus === "REJECTED") && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm row gap-6 center"
                        style={{ fontSize: 12, padding: "6px 14px", alignSelf: "flex-start" }}
                        disabled={loadingPay === apt.id}
                        onClick={() => openPay(apt)}
                      >
                        <CreditCard size={13} />
                        {loadingPay === apt.id ? t("loading_ellipsis") : apt.paymentStatus === "REJECTED" ? t("retry_payment") : apt.packagePrice ? tf("pay_amount", { amount: apt.packagePrice }) : t("pay_now")}
                      </button>
                    )}

                    {/* Stuck unpaid card (payable, past its slot, still owed): a
                        subtle local-only dismiss. Does NOT cancel/modify the
                        booking — just hides it on this device. */}
                    {isDismissible(apt) && (
                      <button
                        type="button"
                        className="tiny semi"
                        style={{ alignSelf: "flex-start", color: "var(--ink-400)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", textDecoration: "underline" }}
                        onClick={() => dismissCard(apt)}
                      >
                        {t("dismiss_word")}
                      </button>
                    )}

                    {apt.status === "ACCEPTED" && apt.responseNote && (
                      <div className="card row gap-10 center-v" style={{ padding: 10, background: "var(--green-100)", border: "1px solid var(--green-500)", borderRadius: 10 }}>
                        <CheckCircle2 size={18} color="var(--green-500)" style={{ flexShrink: 0 }} />
                        <div>
                          <div className="bold tiny" style={{ color: "var(--green-700)" }}>{t("confirmed_word")}</div>
                          <div className="tiny" style={{ color: "var(--green-600)", marginTop: 1, fontStyle: "italic" }}>{tf("message_quoted", { note: apt.responseNote })}</div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="row gap-8" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 2 }}>
                      {tab === "UPCOMING" ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline grow btn-sm row gap-4 center"
                            style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }}
                            disabled={busy}
                            onClick={() => setCancelConfirm(apt)}
                          >
                            <XIcon size={14} /> {cancelling === apt.id ? t("cancelling_ellipsis") : t("cancel_action")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary grow btn-sm row gap-4 center"
                            disabled={busy}
                            onClick={() => openRebook(apt, "RESCHEDULE")}
                          >
                            <CalendarClock size={14} /> {loadingTarget === apt.id ? t("opening_ellipsis") : t("reschedule_word")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary grow btn-sm row gap-4 center"
                          disabled={busy}
                          onClick={() => openRebook(apt, "AGAIN")}
                        >
                          <RotateCcw size={14} /> {loadingTarget === apt.id ? t("opening_ellipsis") : t("book_again")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12 }}
                        onClick={() => nav(`/${apt.targetType.toLowerCase()}/${apt.targetId}`)}
                      >
                        {apt.targetType === "BUSINESS" ? t("view_shop") : t("view_profile")}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>

      {/* Reschedule / Book-again sheet */}
      {rebook && (
        <AppointmentSheet
          targetId={rebook.apt.targetId}
          targetName={rebook.apt.targetName}
          targetType={rebook.apt.targetType}
          availabilityNote={rebook.availabilityNote}
          packages={rebook.packages}
          availableNow={rebook.availableNow}
          paymentTiming={rebook.paymentTiming}
          payeeUpiId={rebook.payeeUpiId}
          depositPercent={rebook.depositPercent}
          rescheduledFromId={rebook.mode === "RESCHEDULE" ? rebook.apt.id : undefined}
          rescheduledFromLabel={rebook.mode === "RESCHEDULE" ? { dateLabel: rebook.apt.dateLabel, timeLabel: rebook.apt.timeLabel } : undefined}
          vocabulary={BUSINESS_PACKAGES[rebook.targetPackageKey].vocabulary}
          targetPackageKey={rebook.targetPackageKey}
          onBooked={handleBooked}
          onClose={() => { setRebook(null); refetch(); }}
        />
      )}

      {/* Payment sheet */}
      {payingApt && (
        <PaymentSheet
          appointment={payingApt}
          businessUpiId={payBizUpiId}
          businessName={payingApt.targetName}
          vocabulary={vocabForRow(payingApt)}
          onPaid={refetch}
          onClose={() => { setPayingApt(null); setPayBizUpiId(null); }}
        />
      )}

      {/* Cancel confirmation */}
      {cancelConfirm && (
        <div className="overlay" onClick={() => setCancelConfirm(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h2 className="h2" style={{ marginBottom: 6 }}>{tf("cancel_this_noun", { noun: vocabForRow(cancelConfirm).noun })}</h2>
            <p className="small muted" style={{ marginBottom: "var(--space-md)", lineHeight: 1.5 }}>
              {tf("will_be_notified", { name: cancelConfirm.targetName })}
              {cancelConfirm.paymentStatus === "PAID" && t("already_paid_refund_notice")}
            </p>
            <div className="col gap-8">
              <button className="btn btn-block" style={{ background: "var(--red-500)", color: "#fff" }} onClick={() => cancel(cancelConfirm)}>
                {t("yes_cancel")}
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setCancelConfirm(null)}>{tf("keep_noun", { noun: vocabForRow(cancelConfirm).noun })}</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && <PhotoPreviewModal src={previewPhoto} onClose={() => setPreviewPhoto(null)} />}
    </div>
  );
}
