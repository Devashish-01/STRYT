import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { appointmentService, businessService, providerService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import type { AppointmentRecord } from "@/types";
import { AppointmentSheet, type BookingPackage } from "@/components/AppointmentSheet";
import { evaluateProviderAvailability, DEFAULT_WORKING_HOURS } from "@/utils/availability";
import { Calendar, Image as ImageIcon, X as XIcon, AlertCircle, CheckCircle2, RotateCcw, CalendarClock, CreditCard } from "lucide-react";
import { PaymentSheet } from "@/components/PaymentSheet";
import { CancelAttributionNote } from "@/screens/business/manage/BusinessAppointments";

// A booking counts as "upcoming" while it is still live and in the future.
function isUpcoming(a: AppointmentRecord): boolean {
  const future = new Date(a.scheduledForISO).getTime() > Date.now();
  return (a.status === "PENDING" || a.status === "ACCEPTED") && future;
}

interface RebookTarget {
  apt: AppointmentRecord;
  mode: "RESCHEDULE" | "AGAIN";
  availabilityNote?: string;
  packages: BookingPackage[];
  availableNow: boolean;
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

  const list = (data ?? []).filter((a) => (tab === "UPCOMING" ? isUpcoming(a) : !isUpcoming(a)));
  const upcomingCount = (data ?? []).filter(isUpcoming).length;

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
        const [b, pkgs] = await Promise.all([
          businessService.get(apt.targetId),
          businessService.packages(apt.targetId).catch(() => []),
        ]);
        if (!b) throw new Error("Shop unavailable");
        const availableNow = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil).isOpenNow;
        setRebook({
          apt,
          mode,
          availabilityNote: b.hours || DEFAULT_WORKING_HOURS,
          packages: pkgs.length > 0
            ? pkgs.map((pk) => ({ id: pk.id, name: pk.name, price: pk.price, duration: pk.duration }))
            : (b.catalog ?? []).map((it) => ({ id: it.id, name: it.name, price: it.salePrice ?? it.price })),
          availableNow,
        });
      } else {
        const [p, pkgs] = await Promise.all([
          providerService.get(apt.targetId),
          providerService.packages(apt.targetId),
        ]);
        if (!p) throw new Error("Provider unavailable");
        const availableNow = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil).isOpenNow;
        setRebook({
          apt,
          mode,
          availabilityNote: p.availabilityNote,
          packages: (pkgs ?? []).map((pk) => ({ id: pk.id, name: pk.name, price: pk.price, duration: pk.duration })),
          availableNow,
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

  // On a successful reschedule, cancel the original so it isn't a duplicate.
  async function handleBooked() {
    if (rebook?.mode === "RESCHEDULE") {
      try { await appointmentService.updateStatus(rebook.apt.id, "CANCELLED", undefined, "CUSTOMER"); } catch { /* best-effort */ }
    }
  }

  return (
    <div className="screen">
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

      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
            {list.length === 0 ? (
              <EmptyState
                emoji="📅"
                title={tab === "UPCOMING" ? "No upcoming appointments" : "Nothing here yet"}
                text={tab === "UPCOMING" ? "Book a slot with a shop or provider and it'll show up here." : "Past, declined and cancelled bookings appear here."}
              />
            ) : (
              list.map((apt) => {
                const busy = cancelling === apt.id || loadingTarget === apt.id;
                return (
                  <div key={apt.id} className="card col gap-10" style={{ padding: 14 }}>
                    <div className="row between center-v">
                      <div>
                        <div className="bold small" style={{ color: "var(--ink-900)" }}>{apt.targetName}</div>
                        <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                          <Calendar size={12} color="var(--brand-600)" /> {apt.dateLabel} at {apt.timeLabel}
                        </div>
                      </div>
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
                    </div>

                    {apt.packageName && (
                      <div className="tiny semi" style={{ color: "var(--brand-700)" }}>
                        📦 {apt.packageName}{apt.packagePrice ? ` • ₹${apt.packagePrice}` : ""}
                      </div>
                    )}

                    {apt.notes && (
                      <div className="tiny" style={{ background: "var(--ink-50)", padding: 8, borderRadius: 8, color: "var(--ink-700)" }}>
                        📝 <strong>Your note:</strong> {apt.notes}
                      </div>
                    )}

                    {apt.photoUrl && (
                      <div className="row gap-8 center-v">
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto(apt.photoUrl!)}
                          className="row gap-6 center-v"
                          style={{ background: "none", border: "none", color: "var(--brand-700)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}
                        >
                          <ImageIcon size={14} /> View your attached reference photo
                        </button>
                      </div>
                    )}

                    {apt.status === "REJECTED" && <CancelAttributionNote apt={apt} viewpoint="CUSTOMER" />}

                    {/* Payment status */}
                    {apt.status === "ACCEPTED" && apt.paymentStatus === "PAID" && (
                      <div className="card row gap-8 center-v" style={{ padding: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
                        <CheckCircle2 size={16} color="var(--green-500)" style={{ flexShrink: 0 }} />
                        <span className="tiny semi" style={{ color: "#15803d" }}>
                          Payment confirmed{apt.paymentMethod ? ` via ${apt.paymentMethod}` : ""}
                          {apt.paymentAmount ? ` • ₹${apt.paymentAmount}` : ""}
                        </span>
                      </div>
                    )}
                    {apt.status === "ACCEPTED" && apt.paymentStatus === "PENDING_CONFIRM" && (
                      <div className="card row gap-8 center-v" style={{ padding: 10, background: "#fefce8", border: "1px solid #fef08a", borderRadius: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>⏳</span>
                        <div>
                          <div className="tiny semi" style={{ color: "#854d0e" }}>Awaiting confirmation</div>
                          <div className="tiny" style={{ color: "#78350f", marginTop: 1 }}>{apt.targetName} will verify and confirm receipt in their app.</div>
                        </div>
                      </div>
                    )}
                    {apt.status === "ACCEPTED" && apt.paymentStatus === "REJECTED" && (
                      <div className="card row gap-8 center-v" style={{ padding: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
                        <AlertCircle size={16} color="var(--red-600)" style={{ flexShrink: 0 }} />
                        <div className="grow">
                          <div className="tiny semi" style={{ color: "#991b1b" }}>Business couldn't verify payment</div>
                          <div className="tiny" style={{ color: "#7f1d1d", marginTop: 1 }}>Please retry or contact them directly.</div>
                        </div>
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: "4px 10px", background: "var(--brand-600)", color: "#fff", borderRadius: 8, flexShrink: 0 }}
                          disabled={loadingPay === apt.id}
                          onClick={() => openPay(apt)}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {apt.status === "ACCEPTED" && (!apt.paymentStatus || apt.paymentStatus === "UNPAID") && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm row gap-6 center"
                        style={{ fontSize: 12, padding: "6px 14px", alignSelf: "flex-start" }}
                        disabled={loadingPay === apt.id}
                        onClick={() => openPay(apt)}
                      >
                        <CreditCard size={13} />{loadingPay === apt.id ? "Loading…" : apt.packagePrice ? `Pay ₹${apt.packagePrice}` : "Pay now"}
                      </button>
                    )}

                    {apt.status === "ACCEPTED" && apt.responseNote && (
                      <div className="card row gap-10 center-v" style={{ padding: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
                        <CheckCircle2 size={18} color="var(--green-500)" style={{ flexShrink: 0 }} />
                        <div>
                          <div className="bold tiny" style={{ color: "#166534" }}>Confirmed</div>
                          <div className="tiny" style={{ color: "#14532d", marginTop: 1, fontStyle: "italic" }}>Message: "{apt.responseNote}"</div>
                        </div>
                      </div>
                    )}

                    {apt.status === "CANCELLED" && <CancelAttributionNote apt={apt} viewpoint="CUSTOMER" />}

                    {/* Actions */}
                    <div className="row gap-8" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 2 }}>
                      {tab === "UPCOMING" ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline grow btn-sm row gap-4 center"
                            style={{ color: "var(--red-600)", borderColor: "#fca5a5" }}
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
