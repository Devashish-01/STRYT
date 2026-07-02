import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { appointmentService, businessService, slotBlockService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import {
  Calendar, Check, X as XIcon, Image as ImageIcon, CheckCircle2, AlertTriangle,
  Share2, IndianRupee, Ban,
} from "lucide-react";
import type { AppointmentRecord, BlockedSlot, CancelledBy } from "@/types";
import { dateKey } from "@/utils/availability";
import { copyText } from "@/lib/clipboard";
import ManageNav from "./ManageNav";
import DateStrip from "@/components/appointments/DateStrip";
import DayTimetable from "@/components/appointments/DayTimetable";
import BlockSlotModal from "@/components/appointments/BlockSlotModal";
import WalkInModal from "@/components/appointments/WalkInModal";

type ConsoleTab = "TODAY" | "UPCOMING" | "HISTORY" | "CANCELLED";

export default function BusinessAppointments() {
  const { id = "b1" } = useParams();
  const { showToast } = useApp();
  const { data: b } = useQuery(() => businessService.get(id), [id]);
  const { data: bizPackages } = useQuery(() => businessService.packages(id).catch(() => []), [id]);
  const { data, loading, error, refetch } = useQueryWithRealtime<AppointmentRecord[]>(
    () => appointmentService.listForTarget(id),
    "appointments",
    [id],
    `target_id=eq.${id}`
  );
  const { data: blockedData, refetch: refetchBlocked } = useQuery<BlockedSlot[]>(
    () => slotBlockService.list(id),
    [id]
  );

  const [tab, setTab] = useState<ConsoleTab>("TODAY");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [activeApt, setActiveApt] = useState<AppointmentRecord | null>(null);
  const [actionType, setActionType] = useState<"ACCEPT" | "REJECT" | "CANCEL" | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [paymentAction, setPaymentAction] = useState<{ apt: AppointmentRecord; action: "CONFIRM" | "REJECT" } | null>(null);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);

  const [blockModal, setBlockModal] = useState<{ date: Date; timeLabel: string | null } | null>(null);
  const [blockSubmitting, setBlockSubmitting] = useState(false);
  const [walkInModal, setWalkInModal] = useState<{ date: Date; timeLabel: string } | null>(null);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [noShowBusy, setNoShowBusy] = useState<string | null>(null);

  const appointments = useMemo(() => data ?? [], [data]);
  const blockedSlots = blockedData ?? [];

  async function handleUpdateStatus() {
    if (!activeApt || !actionType) return;
    try {
      const newStatus = actionType === "ACCEPT" ? "ACCEPTED" : actionType === "REJECT" ? "REJECTED" : "CANCELLED";
      const cancelledBy: CancelledBy | undefined = actionType === "CANCEL" ? "OWNER" : undefined;
      await appointmentService.updateStatus(activeApt.id, newStatus, responseNote.trim() || undefined, cancelledBy);
      showToast(
        actionType === "ACCEPT" ? "Appointment accepted 📅"
        : actionType === "REJECT" ? "Appointment declined."
        : "Appointment cancelled — customer has been notified."
      );
      setActiveApt(null);
      setActionType(null);
      setResponseNote("");
      refetch();
    } catch {
      showToast("Couldn't update appointment");
    }
  }

  async function handlePaymentAction(apt: AppointmentRecord, action: "CONFIRM" | "REJECT") {
    setProcessingPayment(apt.id);
    try {
      if (action === "CONFIRM") {
        await appointmentService.confirmPayment(apt.id);
        showToast("Payment confirmed ✓");
      } else {
        await appointmentService.rejectPaymentClaim(apt.id);
        showToast("Payment claim rejected — customer notified.");
      }
      setPaymentAction(null);
      refetch();
    } catch {
      showToast("Couldn't update payment status. Try again.");
    } finally {
      setProcessingPayment(null);
    }
  }

  async function markNoShow(apt: AppointmentRecord) {
    setNoShowBusy(apt.id);
    try {
      await appointmentService.updateStatus(apt.id, "NO_SHOW");
      showToast("Marked as no-show");
      refetch();
    } catch {
      showToast("Couldn't update. Try again.");
    } finally {
      setNoShowBusy(null);
    }
  }

  // Count how many previous rejected UPI claims this customer has with this business.
  function rejectedClaimsCount(customerId: string): number {
    return appointments.filter((a) => a.customerId === customerId && a.paymentStatus === "REJECTED").length;
  }
  function noShowCount(customerId: string): number {
    return appointments.filter((a) => a.customerId === customerId && a.status === "NO_SHOW").length;
  }

  async function confirmBlock(opts: { recurring: boolean; reason: string }) {
    if (!blockModal) return;
    setBlockSubmitting(true);
    try {
      if (opts.recurring) {
        await slotBlockService.blockRecurring(id, "BUSINESS", blockModal.date.getDay(), blockModal.timeLabel, opts.reason || undefined);
      } else {
        await slotBlockService.blockDate(id, "BUSINESS", dateKey(blockModal.date), blockModal.timeLabel, opts.reason || undefined);
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
        targetType: "BUSINESS",
        targetName: b?.name ?? "Shop",
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
      refetch();
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
    const header = `📅 ${selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} — ${b?.name ?? "Bookings"}`;
    const text = `${header}\n\n${lines.length ? lines.join("\n") : "No bookings"}${revenue ? `\n\n💰 Revenue: ₹${revenue}` : ""}`;
    copyText(text).then((ok) => showToast(ok ? "Day summary copied — paste into WhatsApp" : "Couldn't copy"));
  }

  // ── Card renderer, reused inline in the timetable and in the flat list tabs ──
  function renderAppointmentCard(apt: AppointmentRecord) {
    const repeatOffender = rejectedClaimsCount(apt.customerId);
    const repeatNoShow = noShowCount(apt.customerId);
    return (
      <div key={apt.id} className="card col gap-10" style={{ padding: 14 }}>
        <div className="row between center-v">
          <div className="row gap-10 center-v">
            <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 42, height: 42 }} />
            <div>
              <div className="row gap-6 center-v">
                <div className="bold small">{apt.customerName}</div>
                {apt.isWalkIn && <span className="badge badge-gray" style={{ fontSize: 9, padding: "1px 6px" }}>Walk-in</span>}
              </div>
              <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                <Calendar size={12} color="var(--brand-600)" /> {apt.dateLabel} at {apt.timeLabel}
              </div>
            </div>
          </div>
          <div className="col gap-4" style={{ alignItems: "flex-end" }}>
            <span
              className={`badge ${
                apt.status === "ACCEPTED" ? "badge-green"
                : apt.status === "COMPLETED" ? "badge-green"
                : apt.status === "NO_SHOW" ? "badge-red"
                : apt.status === "REJECTED" || apt.status === "CANCELLED" ? "badge-gray"
                : "badge-purple"
              }`}
              style={{ fontSize: 10, padding: "2px 8px" }}
            >
              {apt.status}
            </span>
            {apt.paymentStatus === "PAID" && (
              <span className="badge badge-green" style={{ fontSize: 9, padding: "2px 7px" }}>
                ₹ {apt.paymentMethod === "UPI" ? "UPI paid" : "Cash paid"}
              </span>
            )}
          </div>
        </div>

        {(repeatOffender > 0 || repeatNoShow > 0) && apt.status === "PENDING" && (
          <div className="row gap-6 center-v" style={{ background: "#fef2f2", padding: "6px 10px", borderRadius: 8 }}>
            <AlertTriangle size={13} color="#dc2626" />
            <span className="tiny" style={{ color: "#991b1b" }}>
              {repeatNoShow > 0 ? `${repeatNoShow} past no-show${repeatNoShow > 1 ? "s" : ""}` : ""}
              {repeatNoShow > 0 && repeatOffender > 0 ? " • " : ""}
              {repeatOffender > 0 ? `${repeatOffender} rejected payment claim${repeatOffender > 1 ? "s" : ""}` : ""}
            </span>
          </div>
        )}

        {apt.packageName && (
          <div className="tiny semi" style={{ color: "var(--brand-700)" }}>
            📦 {apt.packageName}{apt.packagePrice ? ` • ₹${apt.packagePrice}` : ""}
          </div>
        )}

        {apt.notes && (
          <div className="tiny" style={{ background: "var(--ink-50)", padding: 8, borderRadius: 8, color: "var(--ink-700)" }}>
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
          <div className="tiny" style={{ color: apt.status === "REJECTED" || apt.status === "CANCELLED" ? "#b45309" : "#15803d", fontStyle: "italic" }}>
            Your reply: "{apt.responseNote}"
          </div>
        )}

        {(apt.status === "CANCELLED" || apt.status === "REJECTED") && (
          <CancelAttributionNote apt={apt} viewpoint="OWNER" />
        )}

        {/* Payment: customer claimed — awaiting your confirmation */}
        {apt.paymentStatus === "PENDING_CONFIRM" && (
          <div className="card col gap-10" style={{ padding: 12, background: "#fefce8", border: "1px solid #fef08a", borderRadius: 12, marginTop: 2 }}>
            <div className="row gap-8 center-v">
              <span style={{ fontSize: 18 }}>⏳</span>
              <div className="grow">
                <div className="tiny semi" style={{ color: "#854d0e" }}>Customer claims payment via {apt.paymentMethod}</div>
                <div className="tiny" style={{ color: "#78350f", marginTop: 1 }}>
                  {apt.paymentAmount ? `Amount: ₹${apt.paymentAmount}` : "Amount not specified"}
                  {apt.paymentReference ? ` • Ref: ${apt.paymentReference}` : ""}
                </div>
              </div>
            </div>
            {repeatOffender > 0 && (
              <div className="row gap-6 center-v" style={{ background: "#fef2f2", padding: "6px 10px", borderRadius: 8 }}>
                <AlertTriangle size={13} color="#dc2626" />
                <span className="tiny" style={{ color: "#991b1b" }}>
                  This customer has {repeatOffender} previously rejected claim{repeatOffender > 1 ? "s" : ""} at this shop.
                </span>
              </div>
            )}
            <div className="row gap-8">
              <button className="btn btn-green grow btn-sm" disabled={processingPayment === apt.id} onClick={() => setPaymentAction({ apt, action: "CONFIRM" })}>
                <CheckCircle2 size={14} /> Confirm received
              </button>
              <button className="btn btn-outline grow btn-sm" style={{ color: "#dc2626", borderColor: "#fca5a5" }} disabled={processingPayment === apt.id} onClick={() => setPaymentAction({ apt, action: "REJECT" })}>
                <XIcon size={14} /> Can't verify
              </button>
            </div>
          </div>
        )}

        {apt.paymentStatus === "PAID" && (
          <div className="row gap-8 center-v" style={{ padding: "8px 0 2px" }}>
            <CheckCircle2 size={15} color="#16a34a" />
            <span className="tiny semi" style={{ color: "#15803d" }}>
              Payment confirmed via {apt.paymentMethod ?? "unknown"}
              {apt.paymentAmount ? ` • ₹${apt.paymentAmount}` : ""}
              {apt.paymentReference ? ` (ref: ${apt.paymentReference})` : ""}
            </span>
          </div>
        )}

        {(apt.status === "PENDING" || apt.status === "ACCEPTED") && (
          <div className="row gap-8" style={{ marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            {apt.status === "PENDING" && (
              <>
                <button type="button" className="btn btn-green grow btn-sm row gap-4 center" onClick={() => { setActiveApt(apt); setActionType("ACCEPT"); setResponseNote(""); }}>
                  <Check size={14} /> Accept
                </button>
                <button type="button" className="btn btn-outline grow btn-sm row gap-4 center" style={{ color: "#dc2626", borderColor: "#fca5a5" }} onClick={() => { setActiveApt(apt); setActionType("REJECT"); setResponseNote(""); }}>
                  <XIcon size={14} /> Decline
                </button>
              </>
            )}
            {apt.status === "ACCEPTED" && (
              <button type="button" className="btn btn-outline grow btn-sm row gap-4 center" style={{ color: "#dc2626", borderColor: "#fca5a5" }} onClick={() => { setActiveApt(apt); setActionType("CANCEL"); setResponseNote(""); }}>
                <XIcon size={14} /> Cancel appointment
              </button>
            )}
          </div>
        )}

        {apt.status === "COMPLETED" && (
          <button
            type="button"
            className="row gap-4 center-v tiny semi"
            style={{ color: "#dc2626", alignSelf: "flex-start", marginTop: 2 }}
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

  const packageOptions = (bizPackages ?? []).map((pk) => ({ id: pk.id, name: pk.name, price: pk.price, duration: pk.duration }));

  return (
    <div className="screen with-nav">
      <AppBar title="Appointments" subtitle={`Bookings for ${b?.name ?? "your shop"}`} />

      {/* Tabs */}
      <div className="hscroll" style={{ paddingTop: 10, paddingBottom: 6 }}>
        {([["TODAY", "📅 Day view"], ["UPCOMING", `⏭️ Upcoming (${upcomingList.length})`], ["HISTORY", "🕘 History"], ["CANCELLED", `🚫 Cancelled (${cancelledList.length})`]] as const).map(([t, label]) => (
          <button key={t} className={`chip ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}

        {!loading && !error && tab === "TODAY" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
            <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} appointments={appointments} />

            <div className="card row gap-14" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
              <SummaryStat label="Booked" value={bookedCount} />
              <SummaryStat label="Pending" value={pendingCount} />
              <SummaryStat label="Blocked" value={blockedCount} />
              {dayRevenue > 0 && <SummaryStat label="Revenue" value={`₹${dayRevenue}`} icon={<IndianRupee size={12} />} />}
              <button className="icon-btn" style={{ marginLeft: "auto", width: 32, height: 32 }} title="Copy day summary" onClick={copyDaySummary}>
                <Share2 size={15} />
              </button>
            </div>

            <DayTimetable
              date={selectedDate}
              availabilityNote={b?.hours || "Mon–Sat from 09:00 AM to 07:00 PM"}
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

        {!loading && !error && tab === "UPCOMING" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {upcomingList.length === 0 ? (
              <EmptyState emoji="📅" title="No upcoming appointments" text="New bookings will appear here." />
            ) : (
              upcomingList.map(renderAppointmentCard)
            )}
          </div>
        )}

        {!loading && !error && tab === "HISTORY" && (
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

        {!loading && !error && tab === "CANCELLED" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {cancelledList.length === 0 ? (
              <EmptyState emoji="🚫" title="No cancelled bookings" text="Cancelled and declined appointments will appear here." />
            ) : (
              cancelledList.map((apt) => (
                <div key={apt.id} className="card col gap-8" style={{ padding: 14, opacity: apt.cancelledBy === "CUSTOMER" ? 0.75 : 1 }}>
                  <div className="row between center-v">
                    <div className="row gap-10 center-v">
                      <SafeImg src={apt.customerAvatar} variant="avatar" style={{ width: 38, height: 38 }} />
                      <div>
                        <div className="bold small">{apt.customerName}</div>
                        <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                          <Calendar size={12} /> {apt.dateLabel} at {apt.timeLabel}
                        </div>
                      </div>
                    </div>
                    <span className="badge badge-gray" style={{ fontSize: 10 }}>{apt.status}</span>
                  </div>
                  <CancelAttributionNote apt={apt} viewpoint="OWNER" />
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ height: 16 }} />
      </div>

      {/* Response Note Modal (Accept / Decline / Cancel) */}
      {activeApt && actionType && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card col gap-14" style={{ width: "100%", maxWidth: 400, padding: 20, background: "#fff" }}>
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
                actionType === "ACCEPT" ? "e.g. See you then! Please arrive 5 min early."
                : actionType === "REJECT" ? "e.g. Sorry, we're fully booked that day."
                : "e.g. Sorry, we need to close for a family emergency."
              }
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              style={{ fontSize: 13, padding: 10 }}
            />
            <div className="row gap-8 end">
              <button className="btn btn-ghost btn-sm" onClick={() => { setActiveApt(null); setActionType(null); }}>Back</button>
              <button
                className={`btn btn-sm ${actionType === "ACCEPT" ? "btn-green" : "btn-primary"}`}
                style={actionType === "CANCEL" ? { background: "#dc2626", color: "#fff" } : undefined}
                onClick={handleUpdateStatus}
              >
                {actionType === "ACCEPT" ? "Confirm" : actionType === "REJECT" ? "Decline" : "Cancel appointment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment confirm/reject modal */}
      {paymentAction && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card col gap-14" style={{ width: "100%", maxWidth: 380, padding: 20, background: "#fff" }}>
            <div className="bold" style={{ fontSize: 16 }}>
              {paymentAction.action === "CONFIRM" ? "Confirm payment received?" : "Reject this payment claim?"}
            </div>
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              {paymentAction.action === "CONFIRM"
                ? `This will mark ${paymentAction.apt.customerName}'s appointment as fully paid. Make sure you've checked your bank app or UPI history before confirming.`
                : `The customer will be notified that you couldn't verify their payment. They can retry. Repeated false claims are tracked.`}
            </div>
            {paymentAction.action === "CONFIRM" && paymentAction.apt.paymentAmount && (
              <div className="bold" style={{ fontSize: 22, color: "#16a34a" }}>₹{paymentAction.apt.paymentAmount}</div>
            )}
            <div className="row gap-8 end">
              <button className="btn btn-ghost btn-sm" onClick={() => setPaymentAction(null)}>Back</button>
              <button
                className={`btn btn-sm ${paymentAction.action === "CONFIRM" ? "btn-green" : ""}`}
                style={paymentAction.action === "REJECT" ? { background: "#dc2626", color: "#fff" } : undefined}
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

      {/* Photo Fullscreen Preview */}
      {previewPhoto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setPreviewPhoto(null)}>
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
            <img src={previewPhoto} alt="Attachment Preview" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} />
            <button className="icon-btn" style={{ position: "absolute", top: -12, right: -12, background: "#fff", color: "#000" }} onClick={() => setPreviewPhoto(null)}><XIcon size={18} /></button>
          </div>
        </div>
      )}

      <ManageNav bizId={id} />
    </div>
  );
}

function SummaryStat({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
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

/** Cancellation attribution note, phrased from the given viewpoint. */
export function CancelAttributionNote({ apt, viewpoint }: { apt: AppointmentRecord; viewpoint: "OWNER" | "CUSTOMER" }) {
  if (apt.status === "REJECTED") {
    return (
      <div className="card row gap-10 center-v" style={{ padding: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
        <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
        <div>
          <div className="bold tiny" style={{ color: "#991b1b" }}>{viewpoint === "OWNER" ? "You declined this booking" : `Declined by ${apt.targetName}`}</div>
          {apt.responseNote ? (
            <div className="tiny" style={{ color: "#7f1d1d", marginTop: 1, fontStyle: "italic" }}>Reason: "{apt.responseNote}"</div>
          ) : (
            <div className="tiny" style={{ color: "#7f1d1d", marginTop: 1 }}>No specific reason was provided.</div>
          )}
        </div>
      </div>
    );
  }
  if (apt.status !== "CANCELLED") return null;

  const who = apt.cancelledBy;
  const title = viewpoint === "OWNER"
    ? (who === "CUSTOMER" ? "Cancelled by customer" : who === "SYSTEM" ? "Auto-cancelled (you didn't respond in time)" : "Cancelled by you")
    : (who === "CUSTOMER" ? "Cancelled by you" : who === "SYSTEM" ? `Auto-cancelled — ${apt.targetName} didn't respond in time` : `Cancelled by ${apt.targetName}`);

  return (
    <div className="card row gap-10 center-v" style={{ padding: 10, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10 }}>
      <AlertTriangle size={16} color="#c2410c" style={{ flexShrink: 0 }} />
      <div>
        <div className="bold tiny" style={{ color: "#9a3412" }}>{title}</div>
        {apt.responseNote ? (
          <div className="tiny" style={{ color: "#7c2d12", marginTop: 1, fontStyle: "italic" }}>Reason: "{apt.responseNote}"</div>
        ) : (
          <div className="tiny" style={{ color: "#7c2d12", marginTop: 1 }}>No reason was provided.</div>
        )}
      </div>
    </div>
  );
}
