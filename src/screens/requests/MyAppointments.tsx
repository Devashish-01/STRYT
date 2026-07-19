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
import { Calendar, Image as ImageIcon, X as XIcon, CheckCircle2, RotateCcw, CalendarClock, CreditCard } from "@/components/Icons";
import { PaymentSheet } from "@/components/PaymentSheet";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";
import { CancelAttributionNote } from "@/screens/business/manage/BusinessAppointments";

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
}

export default function MyAppointments() {
  const nav = useNavigate();
  const { user, showToast } = useApp();
  const [tab, setTab] = useState<"UPCOMING" | "PAST">("UPCOMING");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [rebook, setRebook] = useState<RebookTarget | null>(null);
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null);
  const [payingApt, setPayingApt] = useState<AppointmentRecord | null>(null);
  const [payBizUpiId, setPayBizUpiId] = useState<string | null>(null);
  const [loadingPay, setLoadingPay] = useState<string | null>(null);

  const { data, loading, error, refetch } = useQueryWithRealtime<AppointmentRecord[]>(
    () => appointmentService.listForCustomer(user.id),
    "appointments",
    [user.id],
    user.id ? `customer_user_id=eq.${user.id}` : undefined
  );

  const { upcomingList, pastList } = useMemo(() => {
    const all = data ?? [];
    return { upcomingList: all.filter(isUpcoming), pastList: all.filter((a) => !isUpcoming(a)) };
  }, [data]);
  const list = tab === "UPCOMING" ? upcomingList : pastList;
  const upcomingCount = upcomingList.length;

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(refetch);

  async function cancel(apt: AppointmentRecord) {
    setCancelling(apt.id);
    try {
      await appointmentService.updateStatus(apt.id, "CANCELLED", undefined, "CUSTOMER");
      showToast("Appointment cancelled");
      refetch();
    } catch {
      showToast("Couldn't cancel. Try again.");
    } finally {
      setCancelling(null);
    }
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
      <AppBar title="My Appointments" subtitle="Track and manage your bookings" />

      {/* Upcoming / Past tabs */}
      <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 6 }}>
        <button className={`chip ${tab === "UPCOMING" ? "active" : ""}`} onClick={() => setTab("UPCOMING")}>
          📅 Upcoming{upcomingCount > 0 ? ` (${upcomingCount})` : ""}
        </button>
        <button className={`chip ${tab === "PAST" ? "active" : ""}`} onClick={() => setTab("PAST")}>
          🕘 Past & cancelled
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
                title={tab === "UPCOMING" ? "No upcoming appointments" : "Nothing here yet"}
                text={tab === "UPCOMING" ? "Book a slot with a shop or provider and it'll show up here." : "Past, declined and cancelled bookings appear here."}
              />
            ) : (
              list.map((apt) => {
                const busy = cancelling === apt.id || loadingTarget === apt.id;
                const payable = isPayable(apt.status);
                return (
                  <div key={apt.id} className="card col gap-10" style={{ padding: 14 }}>
                    <div className="row between center-v">
                      <div>
                        <div className="bold small" style={{ color: "var(--ink-900)" }}>{apt.targetName}</div>
                        <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                          <Calendar size={12} color="var(--brand-600)" /> {apt.dateLabel} at {apt.timeLabel}
                        </div>
                      </div>
                      <div className="col gap-4" style={{ alignItems: "flex-end" }}>
                        <span
                          className={`badge ${
                            apt.status === "ACCEPTED" || apt.status === "COMPLETED"
                              ? "badge-green"
                              : apt.status === "REJECTED" || apt.status === "CANCELLED" || apt.status === "NO_SHOW"
                              ? "badge-gray"
                              : "badge-purple"
                          }`}
                          style={{ fontSize: 10, padding: "3px 9px" }}
                        >
                          {apt.status === "ACCEPTED" ? "CONFIRMED" : apt.status.replace("_", " ")}
                        </span>
                        {payable && (
                          <span
                            className={`badge ${apt.paymentStatus === "PAID" ? "badge-green" : "badge-gray"}`}
                            style={{ fontSize: 9, padding: "2px 7px" }}
                          >
                            {apt.paymentStatus === "PAID" ? "PAID" : "UNPAID"}
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
                            📝 <strong>Your note:</strong> {apt.notes}
                          </div>
                        )}
                        {apt.photoUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewPhoto(apt.photoUrl!)}
                            className="row gap-6 center-v"
                            style={{ background: "none", border: "none", color: "var(--brand-700)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}
                          >
                            <ImageIcon size={14} /> View your attached reference photo
                          </button>
                        )}
                      </div>
                    )}

                    <CancelAttributionNote apt={apt} viewpoint="CUSTOMER" />

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
                        {loadingPay === apt.id ? "Loading…" : apt.paymentStatus === "REJECTED" ? "Retry payment" : apt.packagePrice ? `Pay ₹${apt.packagePrice}` : "Pay now"}
                      </button>
                    )}

                    {apt.status === "ACCEPTED" && apt.responseNote && (
                      <div className="card row gap-10 center-v" style={{ padding: 10, background: "var(--green-100)", border: "1px solid var(--green-500)", borderRadius: 10 }}>
                        <CheckCircle2 size={18} color="var(--green-500)" style={{ flexShrink: 0 }} />
                        <div>
                          <div className="bold tiny" style={{ color: "var(--green-700)" }}>Confirmed</div>
                          <div className="tiny" style={{ color: "var(--green-600)", marginTop: 1, fontStyle: "italic" }}>Message: "{apt.responseNote}"</div>
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
                            onClick={() => cancel(apt)}
                          >
                            <XIcon size={14} /> {cancelling === apt.id ? "Cancelling…" : "Cancel"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary grow btn-sm row gap-4 center"
                            disabled={busy}
                            onClick={() => openRebook(apt, "RESCHEDULE")}
                          >
                            <CalendarClock size={14} /> {loadingTarget === apt.id ? "Opening…" : "Reschedule"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary grow btn-sm row gap-4 center"
                          disabled={busy}
                          onClick={() => openRebook(apt, "AGAIN")}
                        >
                          <RotateCcw size={14} /> {loadingTarget === apt.id ? "Opening…" : "Book again"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12 }}
                        onClick={() => nav(`/${apt.targetType.toLowerCase()}/${apt.targetId}`)}
                      >
                        View {apt.targetType === "BUSINESS" ? "Shop" : "Profile"}
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
          onPaid={refetch}
          onClose={() => { setPayingApt(null); setPayBizUpiId(null); }}
        />
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setPreviewPhoto(null)}>
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
            <img src={previewPhoto} alt="Attachment Preview" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} />
            <button className="icon-btn" style={{ position: "absolute", top: -12, right: -12, background: "#fff", color: "#000" }} onClick={() => setPreviewPhoto(null)}><XIcon size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
