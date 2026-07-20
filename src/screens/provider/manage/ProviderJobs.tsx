import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState, SafeImg, PullToRefreshIndicator } from "@/components/common";
import { ListSkeleton, ErrorView } from "@/components/states";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { appointmentService, providerService, slotBlockService } from "@/services";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import type { AppointmentRecord, BlockedSlot, CancelledBy } from "@/types";
import ProviderManageNav from "./ProviderManageNav";
import { Calendar, Check, X as XIcon, Image as ImageIcon, Ban, Share2, CheckCircle2, AlertTriangle, IndianRupee } from "@/components/Icons";
import { useApp } from "@/store";
import { dateKey, DEFAULT_WORKING_HOURS } from "@/utils/availability";
import { copyText } from "@/lib/clipboard";
import DateStrip from "@/components/appointments/DateStrip";
import DayTimetable from "@/components/appointments/DayTimetable";
import DayFullnessBar from "@/components/appointments/DayFullnessBar";
import BlockSlotModal from "@/components/appointments/BlockSlotModal";
import WalkInModal from "@/components/appointments/WalkInModal";
import { PhotoPreviewModal } from "@/components/appointments/PhotoPreviewModal";
import { CancelAttributionNote } from "@/components/appointments/CancelAttributionNote";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";
import { APPOINTMENT_STATUS_BADGE } from "@/lib/statusBadges";
import { haptics } from "@/lib/haptics";

type ConsoleTab = "TODAY" | "UPCOMING" | "HISTORY" | "CANCELLED";

// The provider's booking calendar — Day view (timetable + walk-in + block),
// Upcoming, History and Cancelled. Extracted from the old combined "Leads"
// screen so the daily driver is a top-level nav destination (see PROVIDER_DESIGN.md).
export default function ProviderJobs() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const { data: p } = useQuery(() => providerService.get(id), [id], `provider:${id}`);

  const { data: aptsData, loading: aptsLoading, error: aptsError, refetch: refetchApts } = useQueryWithRealtime<AppointmentRecord[]>(
    () => appointmentService.listForTarget(id),
    "appointments",
    [id],
    `target_id=eq.${id}`
  );
  const { data: blockedData, refetch: refetchBlocked } = useQuery<BlockedSlot[]>(
    () => slotBlockService.list(id),
    [id]
  );
  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh<HTMLDivElement>(async () => {
    refetchApts();
    refetchBlocked();
  });

  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("UPCOMING");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeApt, setActiveApt] = useState<AppointmentRecord | null>(null);
  const [actionType, setActionType] = useState<"ACCEPT" | "REJECT" | "CANCEL" | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [noShowBusy, setNoShowBusy] = useState<string | null>(null);
  const [paymentAction, setPaymentAction] = useState<{ apt: AppointmentRecord; action: "CONFIRM" | "REJECT" } | null>(null);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [blockModal, setBlockModal] = useState<{ date: Date; timeLabel: string | null } | null>(null);
  const [blockSubmitting, setBlockSubmitting] = useState(false);
  const [walkInModal, setWalkInModal] = useState<{ date: Date; timeLabel: string } | null>(null);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Jobs" />
        <EmptyState emoji="⚠️" title="Missing provider" text="No provider id in the URL." />
      </div>
    );
  }

  const appointments = aptsData ?? [];
  const blockedSlots = blockedData ?? [];

  async function handleUpdateStatus() {
    if (!activeApt || !actionType) return;
    setUpdatingStatus(true);
    try {
      const newStatus = actionType === "ACCEPT" ? "ACCEPTED" : actionType === "REJECT" ? "REJECTED" : "CANCELLED";
      const cancelledBy: CancelledBy | undefined = actionType === "CANCEL" ? "OWNER" : undefined;
      await appointmentService.updateStatus(activeApt.id, newStatus, responseNote.trim() || undefined, cancelledBy);
      if (actionType === "ACCEPT") haptics.success(); else haptics.warning();
      showToast(
        actionType === "ACCEPT" ? "Appointment accepted! 📅"
        : actionType === "REJECT" ? "Appointment declined."
        : "Appointment cancelled — customer has been notified."
      );
      setActiveApt(null);
      setActionType(null);
      setResponseNote("");
      refetchApts();
    } catch {
      showToast("Couldn't update appointment");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handlePaymentAction(apt: AppointmentRecord, action: "CONFIRM" | "REJECT") {
    setProcessingPayment(apt.id);
    try {
      if (action === "CONFIRM") {
        await appointmentService.confirmPayment(apt.id);
        haptics.success();
        showToast("Payment confirmed ✓");
      } else {
        await appointmentService.rejectPaymentClaim(apt.id);
        haptics.warning();
        showToast("Payment claim rejected — customer can resubmit.");
      }
      setPaymentAction(null);
      refetchApts();
    } catch (e: any) {
      console.error("Payment action failed:", e);
      const errorMsg = e?.message || "Couldn't update payment status. Try again.";
      showToast(errorMsg);
    } finally {
      setProcessingPayment(null);
    }
  }

  // Count how many previous rejected UPI claims this customer has with this provider.
  function rejectedClaimsCount(customerId: string): number {
    return appointments.filter((a) => a.customerId === customerId && a.paymentStatus === "REJECTED").length;
  }
  function noShowCount(customerId: string): number {
    return appointments.filter((a) => a.customerId === customerId && a.status === "NO_SHOW").length;
  }

  async function handleRecordWalkInPayment(apt: AppointmentRecord) {
    setProcessingPayment(apt.id);
    try {
      await appointmentService.recordWalkInPayment(apt.id, "CASH", apt.packagePrice ?? apt.paymentAmount ?? null);
      showToast("Walk-in cash payment recorded ✓");
      refetchApts();
    } catch {
      showToast("Couldn't record the payment. Try again.");
    } finally {
      setProcessingPayment(null);
    }
  }

  async function handleNudgePayment(apt: AppointmentRecord) {
    if (!apt.customerId) return;
    try {
      await appointmentService.nudgePayment(apt.id);
      showToast("Payment request nudge sent 🔔");
    } catch {
      showToast("Couldn't send payment nudge.");
    }
  }

  async function markNoShow(apt: AppointmentRecord) {
    setNoShowBusy(apt.id);
    try {
      await appointmentService.updateStatus(apt.id, "NO_SHOW");
      showToast("Marked as no-show");
      refetchApts();
    } catch {
      showToast("Couldn't update. Try again.");
    } finally {
      setNoShowBusy(null);
    }
  }

  async function confirmBlock(opts: { recurring: boolean; reason: string }) {
    if (!blockModal) return;
    setBlockSubmitting(true);
    try {
      if (opts.recurring) {
        await slotBlockService.blockRecurring(id, "PROVIDER", blockModal.date.getDay(), blockModal.timeLabel, opts.reason || undefined);
      } else {
        await slotBlockService.blockDate(id, "PROVIDER", dateKey(blockModal.date), blockModal.timeLabel, opts.reason || undefined);
      }
      showToast(blockModal.timeLabel ? "Slot blocked" : "Day blocked");
      setBlockModal(null);
      refetchBlocked();
    } catch (e: any) {
      showToast(e?.message || "Couldn't block. Try again.");
    } finally {
      setBlockSubmitting(false);
    }
  }

  async function unblock(block: BlockedSlot) {
    try {
      await slotBlockService.unblock(block.id, id);
      showToast("Unblocked");
      refetchBlocked();
    } catch {
      showToast("Couldn't unblock. Try again.");
    }
  }

  async function confirmWalkIn(opts: { name: string; phone: string; packageId?: string; packageName?: string; packagePrice?: number }) {
    if (!walkInModal) return;
    setWalkInSubmitting(true);
    try {
      const iso = new Date(walkInModal.date);
      const [, hh, mm, ap] = /(\d+):(\d+)\s?(AM|PM)/i.exec(walkInModal.timeLabel) ?? [];
      if (hh) {
        let h = parseInt(hh, 10);
        if (/pm/i.test(ap) && h < 12) h += 12;
        if (/am/i.test(ap) && h === 12) h = 0;
        iso.setHours(h, parseInt(mm, 10), 0, 0);
      }
      await appointmentService.createWalkIn({
        targetId: id,
        targetType: "PROVIDER",
        targetName: p?.displayName ?? "Provider",
        customerName: opts.name,
        customerPhone: opts.phone || undefined,
        scheduledForISO: iso.toISOString(),
        dateLabel: iso.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        timeLabel: walkInModal.timeLabel,
        packageId: opts.packageId,
        packageName: opts.packageName,
        packagePrice: opts.packagePrice,
      });
      showToast("Walk-in booking added");
      setWalkInModal(null);
      refetchApts();
    } catch (e: any) {
      showToast(e?.message || "Couldn't add walk-in. Try again.");
    } finally {
      setWalkInSubmitting(false);
    }
  }

  function copyDaySummary() {
    const dKey = dateKey(selectedDate);
    const dayApts = appointments
      .filter((a) => { try { return dateKey(new Date(a.scheduledForISO)) === dKey; } catch { return false; } })
      .filter((a) => a.status !== "CANCELLED" && a.status !== "REJECTED")
      .sort((a, b2) => new Date(a.scheduledForISO).getTime() - new Date(b2.scheduledForISO).getTime());
    const revenue = dayApts.filter((a) => a.paymentStatus === "PAID" && a.paymentAmount).reduce((s, a) => s + (a.paymentAmount || 0), 0);
    const lines = dayApts.map((a) => `${a.timeLabel} — ${a.customerName}${a.packageName ? ` (${a.packageName})` : ""}${a.isWalkIn ? " [walk-in]" : ""}`);
    const header = `📅 ${selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} — ${p?.displayName ?? "Bookings"}`;
    const text = `${header}\n\n${lines.length ? lines.join("\n") : "No bookings"}${revenue ? `\n\n💰 Revenue: ₹${revenue}` : ""}`;
    copyText(text).then((ok) => showToast(ok ? "Day summary copied — paste into WhatsApp" : "Couldn't copy"));
  }

  function renderAppointmentCard(apt: AppointmentRecord) {
    const repeatOffender = rejectedClaimsCount(apt.customerId);
    const repeatNoShow = noShowCount(apt.customerId);
    // When this provider collects payment at booking, Accept is gated on the
    // payment actually clearing.
    const requiresPaymentFirst = p?.paymentTiming === "AT_BOOKING" && apt.paymentStatus !== "PAID";
    return (
      <div key={apt.id} className="card col gap-10 queue-row-enter" style={{ padding: 14 }}>
        <div className="row between center-v">
          <div className="row gap-10 center-v">
            <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 42, height: 42 }} />
            <div>
              <div className="row gap-6 center-v">
                <div className="bold small">{ownerVisibleCustomerName(apt)}</div>
                {apt.isWalkIn && <span className="badge badge-gray" style={{ fontSize: 9, padding: "1px 6px" }}>Walk-in</span>}
              </div>
              <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                <Calendar size={12} color="var(--brand-600)" /> {apt.dateLabel} at {apt.timeLabel}
              </div>
            </div>
          </div>
          <div className="col gap-4" style={{ alignItems: "flex-end" }}>
            <span
              className={`badge ${APPOINTMENT_STATUS_BADGE[apt.status].cls}`}
              style={{ fontSize: 10, padding: "2px 8px" }}
            >
              {APPOINTMENT_STATUS_BADGE[apt.status].label}
            </span>
            {apt.paymentStatus === "PAID" && (
              <span className="badge badge-green" style={{ fontSize: 9, padding: "2px 7px" }}>₹ Paid</span>
            )}
          </div>
        </div>

        {(repeatOffender > 0 || repeatNoShow > 0) && apt.status === "PENDING" && (
          <div className="row gap-6 center-v" style={{ background: "var(--red-50)", padding: "6px 10px", borderRadius: 8 }}>
            <AlertTriangle size={13} color="var(--red-600)" />
            <span className="tiny" style={{ color: "var(--red-600)" }}>
              {repeatNoShow > 0 ? `${repeatNoShow} past no-show${repeatNoShow > 1 ? "s" : ""}` : ""}
              {repeatNoShow > 0 && repeatOffender > 0 ? " • " : ""}
              {repeatOffender > 0 ? `${repeatOffender} rejected payment claim${repeatOffender > 1 ? "s" : ""}` : ""}
            </span>
          </div>
        )}

        {apt.notes && (
          <div className="tiny" style={{ background: "var(--ink-50)", padding: "var(--space-xs)", borderRadius: 8, color: "var(--ink-700)" }}>
            💬 <strong>Note:</strong> {apt.notes}
          </div>
        )}

        {apt.photoUrl && (
          <div className="row gap-8 center-v" style={{ marginTop: 2 }}>
            <button
              type="button"
              onClick={() => setPreviewPhoto(apt.photoUrl!)}
              className="row gap-6 center-v"
              style={{ background: "none", border: "none", color: "var(--brand-700)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}
            >
              <ImageIcon size={14} /> View attached photo reference
            </button>
          </div>
        )}

        {apt.responseNote && (
          <div className="tiny" style={{ color: apt.status === "REJECTED" || apt.status === "CANCELLED" ? "var(--amber-700)" : "var(--green-600)", fontStyle: "italic" }}>
            Response: "{apt.responseNote}"
          </div>
        )}

        {(apt.status === "CANCELLED" || apt.status === "REJECTED") && (
          <CancelAttributionNote apt={apt} viewpoint="OWNER" />
        )}

        {(apt.paymentStatus === "UNPAID" || apt.paymentStatus === "REJECTED") && (apt.status === "ACCEPTED" || apt.status === "COMPLETED") && (
          <div className="card col gap-10" style={{ padding: "var(--space-sm)", background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 12, marginTop: 2 }}>
            <div className="tiny semi muted">Payment is outstanding (Unpaid)</div>
            <div className="row gap-8">
              {apt.isWalkIn && (apt.packagePrice || apt.paymentAmount) ? (
                <button className="btn btn-green grow btn-sm" disabled={!!processingPayment} onClick={() => handleRecordWalkInPayment(apt)}>
                  <CheckCircle2 size={14} /> Record cash received
                </button>
              ) : !apt.isWalkIn ? (
                <button className="btn btn-outline grow btn-sm" style={{ color: "var(--amber-700)", borderColor: "var(--amber-200)" }} disabled={!!processingPayment} onClick={() => handleNudgePayment(apt)}>
                  🔔 Request payment
                </button>
              ) : (
                <span className="tiny muted">Add a priced package before recording walk-in payment.</span>
              )}
            </div>
          </div>
        )}

        {apt.paymentStatus === "PENDING_CONFIRM" && repeatOffender > 0 && (
          <div className="row gap-6 center-v" style={{ background: "var(--red-50)", padding: "6px 10px", borderRadius: 8 }}>
            <AlertTriangle size={13} color="var(--red-600)" />
            <span className="tiny" style={{ color: "var(--red-600)" }}>
              This customer has {repeatOffender} previously rejected claim{repeatOffender > 1 ? "s" : ""} with you.
            </span>
          </div>
        )}

        <PaymentStatusCard
          paymentStatus={apt.paymentStatus}
          paymentMethod={apt.paymentMethod}
          paymentAmount={apt.paymentAmount}
          paymentReference={apt.paymentReference}
          claimantName={apt.customerName}
          viewerIsPayer={false}
          busy={processingPayment === apt.id}
          onConfirm={() => setPaymentAction({ apt, action: "CONFIRM" })}
          onReject={() => setPaymentAction({ apt, action: "REJECT" })}
        />

        {(apt.status === "PENDING" || apt.status === "ACCEPTED") && (
          <div className="row gap-8" style={{ marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            {apt.status === "PENDING" && (
              <>
                {requiresPaymentFirst ? (
                  <div className="grow tiny muted row" style={{ alignItems: "center" }}>
                    {apt.paymentStatus === "PENDING_CONFIRM" ? "Verify the payment claim above to accept" : "Waiting for customer to pay before you can accept"}
                  </div>
                ) : (
                  <button type="button" className="btn btn-green grow btn-sm row gap-4 center" onClick={() => { setActiveApt(apt); setActionType("ACCEPT"); setResponseNote(""); }}>
                    <Check size={14} /> Accept
                  </button>
                )}
                <button type="button" className="btn btn-outline grow btn-sm row gap-4 center" style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }} onClick={() => { setActiveApt(apt); setActionType("REJECT"); setResponseNote(""); }}>
                  <XIcon size={14} /> Decline
                </button>
              </>
            )}
            {apt.status === "ACCEPTED" && (
              <button type="button" className="btn btn-outline grow btn-sm row gap-4 center" style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }} onClick={() => { setActiveApt(apt); setActionType("CANCEL"); setResponseNote(""); }}>
                <XIcon size={14} /> Cancel appointment
              </button>
            )}
          </div>
        )}

        {apt.status === "COMPLETED" && (
          <button
            type="button"
            className="row gap-4 center-v tiny semi"
            style={{ color: "var(--red-600)", alignSelf: "flex-start", marginTop: 2 }}
            disabled={noShowBusy === apt.id}
            onClick={() => markNoShow(apt)}
          >
            <Ban size={12} /> {noShowBusy === apt.id ? "Updating…" : "Customer didn't show up? Mark no-show"}
          </button>
        )}
      </div>
    );
  }

  const dayKeySelected = dateKey(selectedDate);
  const dayApts = appointments.filter((a) => { try { return dateKey(new Date(a.scheduledForISO)) === dayKeySelected; } catch { return false; } });
  const bookedCount = dayApts.filter((a) => a.status === "ACCEPTED" || a.status === "COMPLETED").length;
  const pendingCount = dayApts.filter((a) => a.status === "PENDING").length;
  const dayBlocksForSelected = blockedSlots.filter((bs) => (bs.recurring ? bs.weekday === selectedDate.getDay() : bs.date === dayKeySelected));
  const blockedCount = dayBlocksForSelected.some((bs) => !bs.timeLabel) ? "day" : dayBlocksForSelected.length;
  const dayRevenue = dayApts.filter((a) => a.paymentStatus === "PAID" && a.paymentAmount).reduce((s, a) => s + (a.paymentAmount || 0), 0);

  const now = Date.now();
  const upcomingList = appointments
    .filter((a) => (a.status === "PENDING" || a.status === "ACCEPTED") && new Date(a.scheduledForISO).getTime() > now)
    .sort((a, c) => new Date(a.scheduledForISO).getTime() - new Date(c.scheduledForISO).getTime());

  const historyList = appointments
    .filter((a) => a.status === "COMPLETED" || a.status === "NO_SHOW")
    .sort((a, c) => new Date(c.scheduledForISO).getTime() - new Date(a.scheduledForISO).getTime());
  const historyGroups = groupByDay(historyList);

  const cancelledList = appointments
    .filter((a) => a.status === "CANCELLED" || a.status === "REJECTED")
    .sort((a, c) => new Date(c.scheduledForISO).getTime() - new Date(a.scheduledForISO).getTime());

  const packageOptions = (p?.catalog ?? []).map((item) => ({ id: item.id, name: item.name, price: item.salePrice ?? item.price }));

  return (
    <div className="screen with-nav">
      <AppBar title="Jobs" subtitle={`Bookings for ${p?.displayName ?? "you"}`} />

      {/* Console tabs */}
      <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 4 }}>
        {([["UPCOMING", `⏭️ Upcoming (${upcomingList.length})`], ["TODAY", "📅 Day view"], ["HISTORY", "🕘 History"], ["CANCELLED", `🚫 Cancelled (${cancelledList.length})`]] as const).map(([t, label]) => (
          <button key={t} className={`chip ${consoleTab === t ? "active" : ""}`} style={{ fontSize: 12 }} onClick={() => setConsoleTab(t)}>{label}</button>
        ))}
      </div>

      <div className="screen-scroll" ref={containerRef}>
        <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} threshold={threshold} />
        {aptsLoading && <ListSkeleton count={3} />}
        {aptsError && <ErrorView error={aptsError} onRetry={refetchApts} />}

        {!aptsLoading && !aptsError && consoleTab === "TODAY" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
            <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} appointments={appointments} blockedSlots={blockedSlots} daysBefore={7} daysAfter={30} />

            <div className="card col gap-10" style={{ padding: "var(--space-sm)", background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
              <div className="row gap-14">
                <StatBlock label="Booked" value={bookedCount} />
                <StatBlock label="Pending" value={pendingCount} />
                <StatBlock label="Blocked" value={blockedCount} />
                {dayRevenue > 0 && <StatBlock label="Revenue" value={`₹${dayRevenue}`} icon={<IndianRupee size={12} />} />}
                <button className="icon-btn" style={{ marginLeft: "auto" }} title="Copy day summary" onClick={copyDaySummary}>
                  <Share2 size={15} />
                </button>
              </div>
              <DayFullnessBar date={selectedDate} availabilityNote={p?.availabilityNote || DEFAULT_WORKING_HOURS} appointments={appointments} blockedSlots={blockedSlots} />
            </div>

            <DayTimetable
              date={selectedDate}
              availabilityNote={p?.availabilityNote || DEFAULT_WORKING_HOURS}
              appointments={appointments}
              blockedSlots={blockedSlots}
              renderAppointment={renderAppointmentCard}
              onBlockSlot={(d, t) => setBlockModal({ date: d, timeLabel: t })}
              onUnblockSlot={unblock}
              onAddWalkIn={(d, t) => setWalkInModal({ date: d, timeLabel: t })}
              onBlockWholeDay={() => setBlockModal({ date: selectedDate, timeLabel: null })}
              onUnblockWholeDay={unblock}
            />
          </div>
        )}

        {!aptsLoading && !aptsError && consoleTab === "UPCOMING" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {upcomingList.length === 0 ? (
              <EmptyState emoji="📅" title="No upcoming appointments" text="New bookings will appear here." />
            ) : (
              upcomingList.map(renderAppointmentCard)
            )}
          </div>
        )}

        {!aptsLoading && !aptsError && consoleTab === "HISTORY" && (
          <div className="page-pad col gap-16" style={{ paddingTop: 12 }}>
            {historyList.length === 0 ? (
              <EmptyState emoji="🕘" title="Nothing here yet" text="Completed and past appointments will appear here." />
            ) : (
              historyGroups.map(([day, list]) => (
                <div key={day} className="col gap-10">
                  <div className="tiny semi muted" style={{ position: "sticky", top: 0, background: "var(--bg)", padding: "4px 0", zIndex: 2 }}>{day}</div>
                  {list.map(renderAppointmentCard)}
                </div>
              ))
            )}
          </div>
        )}

        {!aptsLoading && !aptsError && consoleTab === "CANCELLED" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {cancelledList.length === 0 ? (
              <EmptyState emoji="🚫" title="No cancelled bookings" text="Cancelled and declined appointments will appear here." />
            ) : (
              cancelledList.map((apt) => (
                <div key={apt.id} className="card col gap-8 queue-row-enter" style={{ padding: 14, opacity: apt.cancelledBy === "CUSTOMER" ? 0.75 : 1 }}>
                  <div className="row between center-v">
                    <div className="row gap-10 center-v">
                      <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 38, height: 38 }} />
                      <div>
                        <div className="bold small">{ownerVisibleCustomerName(apt)}</div>
                        <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                          <Calendar size={12} /> {apt.dateLabel} at {apt.timeLabel}
                        </div>
                      </div>
                    </div>
                    <span className={`badge ${APPOINTMENT_STATUS_BADGE[apt.status].cls}`} style={{ fontSize: 10 }}>{APPOINTMENT_STATUS_BADGE[apt.status].label}</span>
                  </div>
                  <CancelAttributionNote apt={apt} viewpoint="OWNER" />
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>

      {/* Response Note Modal */}
      {activeApt && actionType && (
        <div className="overlay" onClick={() => { if (!updatingStatus) { setActiveApt(null); setActionType(null); } }}>
          <div className="sheet col gap-14" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="bold large" style={{ fontSize: 16 }}>
              {actionType === "ACCEPT" ? "Accept Appointment" : actionType === "REJECT" ? "Decline Appointment" : "Cancel Appointment"}
            </div>
            <div className="tiny muted">
              {actionType === "CANCEL"
                ? `Add a reason for cancelling ${activeApt.customerName}'s appointment (the customer will see this).`
                : `Add an optional note to send back to ${activeApt.customerName}.`}
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder={
                actionType === "ACCEPT" ? "e.g. See you then! Please keep your gate open."
                : actionType === "REJECT" ? "e.g. Sorry, booked for emergency repairs."
                : "e.g. Sorry, I need to reschedule — please rebook at your convenience."
              }
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              style={{ fontSize: 13, padding: 10 }}
            />
            <div className="row gap-8 end">
              <button className="btn btn-ghost btn-sm" disabled={updatingStatus} onClick={() => { setActiveApt(null); setActionType(null); }}>Back</button>
              <button
                className={`btn btn-sm ${actionType === "ACCEPT" ? "btn-green" : "btn-primary"}`}
                style={actionType === "CANCEL" ? { background: "var(--red-600)", color: "#fff" } : undefined}
                disabled={updatingStatus}
                onClick={handleUpdateStatus}
              >
                {updatingStatus ? "Working…" : actionType === "ACCEPT" ? "Confirm" : actionType === "REJECT" ? "Decline" : "Cancel appointment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment confirm/reject modal */}
      {paymentAction && (
        <div className="overlay" onClick={() => { if (!processingPayment) setPaymentAction(null); }}>
          <div className="sheet col gap-14" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="bold" style={{ fontSize: 16 }}>
              {paymentAction.action === "CONFIRM" ? "Confirm payment received?" : "Reject this payment claim?"}
            </div>
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              {paymentAction.action === "CONFIRM"
                ? `This will mark ${paymentAction.apt.customerName}'s appointment as fully paid. Make sure you've checked your bank app or UPI history before confirming.`
                : `The customer will be notified that you couldn't verify their payment. They can retry. Repeated false claims are tracked.`}
            </div>
            {paymentAction.action === "CONFIRM" && paymentAction.apt.paymentAmount && (
              <div className="bold" style={{ fontSize: 22, color: "var(--green-500)" }}>₹{paymentAction.apt.paymentAmount}</div>
            )}
            <div className="row gap-8 end">
              <button className="btn btn-ghost btn-sm" disabled={!!processingPayment} onClick={() => setPaymentAction(null)}>Back</button>
              <button
                className={`btn btn-sm ${paymentAction.action === "CONFIRM" ? "btn-green" : ""}`}
                style={paymentAction.action === "REJECT" ? { background: "var(--red-600)", color: "#fff" } : undefined}
                disabled={!!processingPayment}
                onClick={() => handlePaymentAction(paymentAction.apt, paymentAction.action)}
              >
                {processingPayment ? "Processing…" : paymentAction.action === "CONFIRM" ? "Yes, confirm received" : "Reject claim"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block slot / whole day modal */}
      {blockModal && (
        <BlockSlotModal
          date={blockModal.date}
          timeLabel={blockModal.timeLabel}
          submitting={blockSubmitting}
          onConfirm={confirmBlock}
          onClose={() => setBlockModal(null)}
        />
      )}

      {/* Walk-in booking modal */}
      {walkInModal && (
        <WalkInModal
          date={walkInModal.date}
          timeLabel={walkInModal.timeLabel}
          packages={packageOptions}
          submitting={walkInSubmitting}
          onConfirm={confirmWalkIn}
          onClose={() => setWalkInModal(null)}
        />
      )}

      {/* Photo Fullscreen Preview Modal */}
      {previewPhoto && <PhotoPreviewModal src={previewPhoto} onClose={() => setPreviewPhoto(null)} />}

      <ProviderManageNav pid={id} />
    </div>
  );
}

function StatBlock({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 1 }}>
      <div className="row gap-3 center-v bold" style={{ fontSize: 15, color: "var(--brand-800)" }}>{icon}{value}</div>
      <div className="tiny muted" style={{ fontSize: 10 }}>{label}</div>
    </div>
  );
}

function groupByDay(list: AppointmentRecord[]): [string, AppointmentRecord[]][] {
  const map = new Map<string, AppointmentRecord[]>();
  for (const apt of list) {
    const label = new Date(apt.scheduledForISO).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(apt);
  }
  return Array.from(map.entries());
}
