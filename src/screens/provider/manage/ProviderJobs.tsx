import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { appointmentService, providerService, slotBlockService } from "@/services";
import { ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import type { AppointmentRecord, BlockedSlot, CancelledBy } from "@/types";
import ProviderManageNav from "./ProviderManageNav";
import { Calendar, Check, X as XIcon, Image as ImageIcon, Ban, Share2, CheckCircle2 } from "@/components/Icons";
import { useApp } from "@/store";
import { dateKey, DEFAULT_WORKING_HOURS } from "@/utils/availability";
import { copyText } from "@/lib/clipboard";
import DateStrip from "@/components/appointments/DateStrip";
import DayTimetable from "@/components/appointments/DayTimetable";
import BlockSlotModal from "@/components/appointments/BlockSlotModal";
import WalkInModal from "@/components/appointments/WalkInModal";
import { CancelAttributionNote } from "@/screens/business/manage/BusinessAppointments";
import { PaymentStatusCard } from "@/components/PaymentStatusCard";

type ConsoleTab = "TODAY" | "UPCOMING" | "HISTORY" | "CANCELLED";

// The provider's booking calendar — Day view (timetable + walk-in + block),
// Upcoming, History and Cancelled. Extracted from the old combined "Leads"
// screen so the daily driver is a top-level nav destination (see PROVIDER_DESIGN.md).
export default function ProviderJobs() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const { data: p } = useQuery(() => providerService.get(id), [id]);

  const { data: aptsData, refetch: refetchApts } = useQueryWithRealtime<AppointmentRecord[]>(
    () => appointmentService.listForTarget(id),
    "appointments",
    [id],
    `target_id=eq.${id}`
  );
  const { data: blockedData, refetch: refetchBlocked } = useQuery<BlockedSlot[]>(
    () => slotBlockService.list(id),
    [id]
  );

  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("TODAY");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeApt, setActiveApt] = useState<AppointmentRecord | null>(null);
  const [actionType, setActionType] = useState<"ACCEPT" | "REJECT" | "CANCEL" | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [noShowBusy, setNoShowBusy] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
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
    try {
      const newStatus = actionType === "ACCEPT" ? "ACCEPTED" : actionType === "REJECT" ? "REJECTED" : "CANCELLED";
      const cancelledBy: CancelledBy | undefined = actionType === "CANCEL" ? "OWNER" : undefined;
      await appointmentService.updateStatus(activeApt.id, newStatus, responseNote.trim() || undefined, cancelledBy);
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
        showToast("Payment claim rejected — customer can resubmit.");
      }
      refetchApts();
    } catch (e: any) {
      console.error("Payment action failed:", e);
      const errorMsg = e?.message || "Couldn't update payment status. Try again.";
      showToast(errorMsg);
    } finally {
      setProcessingPayment(null);
    }
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
    const lines = dayApts.map((a) => `${a.timeLabel} — ${a.customerName}${a.packageName ? ` (${a.packageName})` : ""}${a.isWalkIn ? " [walk-in]" : ""}`);
    const header = `📅 ${selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} — ${p?.displayName ?? "Bookings"}`;
    const text = `${header}\n\n${lines.length ? lines.join("\n") : "No bookings"}`;
    copyText(text).then((ok) => showToast(ok ? "Day summary copied — paste into WhatsApp" : "Couldn't copy"));
  }

  function renderAppointmentCard(apt: AppointmentRecord) {
    // When this provider collects payment at booking, Accept is gated on the
    // payment actually clearing.
    const requiresPaymentFirst = p?.paymentTiming === "AT_BOOKING" && apt.paymentStatus !== "PAID";
    return (
      <div key={apt.id} className="card col gap-10" style={{ padding: 14 }}>
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
              className={`badge ${
                apt.status === "ACCEPTED" || apt.status === "COMPLETED" ? "badge-green"
                : apt.status === "NO_SHOW" ? "badge-red"
                : apt.status === "REJECTED" || apt.status === "CANCELLED" ? "badge-gray"
                : "badge-purple"
              }`}
              style={{ fontSize: 10, padding: "2px 8px" }}
            >
              {apt.status}
            </span>
            {apt.paymentStatus === "PAID" && (
              <span className="badge badge-green" style={{ fontSize: 9, padding: "2px 7px" }}>₹ Paid</span>
            )}
          </div>
        </div>

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
          <div className="tiny" style={{ color: apt.status === "REJECTED" || apt.status === "CANCELLED" ? "var(--amber-700)" : "var(--green-600)", fontStyle: "italic" }}>
            Response: "{apt.responseNote}"
          </div>
        )}

        {(apt.status === "CANCELLED" || apt.status === "REJECTED") && (
          <CancelAttributionNote apt={apt} viewpoint="OWNER" />
        )}

        {(apt.paymentStatus === "UNPAID" || apt.paymentStatus === "REJECTED") && (apt.status === "ACCEPTED" || apt.status === "COMPLETED") && (
          <div className="card col gap-10" style={{ padding: 12, background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 12, marginTop: 2 }}>
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

        <PaymentStatusCard
          paymentStatus={apt.paymentStatus}
          paymentMethod={apt.paymentMethod}
          paymentAmount={apt.paymentAmount}
          paymentReference={apt.paymentReference}
          claimantName={apt.customerName}
          viewerIsPayer={false}
          busy={processingPayment === apt.id}
          onConfirm={() => handlePaymentAction(apt, "CONFIRM")}
          onReject={() => handlePaymentAction(apt, "REJECT")}
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
        {([["TODAY", "📅 Day view"], ["UPCOMING", `⏭️ Upcoming (${upcomingList.length})`], ["HISTORY", "🕘 History"], ["CANCELLED", `🚫 Cancelled (${cancelledList.length})`]] as const).map(([t, label]) => (
          <button key={t} className={`chip ${consoleTab === t ? "active" : ""}`} style={{ fontSize: 12 }} onClick={() => setConsoleTab(t)}>{label}</button>
        ))}
      </div>

      <div className="screen-scroll">
        {consoleTab === "TODAY" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 8 }}>
            <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} appointments={appointments} daysBefore={7} daysAfter={30} />

            <div className="card row gap-14" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
              <StatBlock label="Booked" value={bookedCount} />
              <StatBlock label="Pending" value={pendingCount} />
              <StatBlock label="Blocked" value={blockedCount} />
              <button className="icon-btn" style={{ marginLeft: "auto", width: 32, height: 32 }} title="Copy day summary" onClick={copyDaySummary}>
                <Share2 size={15} />
              </button>
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

        {consoleTab === "UPCOMING" && (
          <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
            {upcomingList.length === 0 ? (
              <EmptyState emoji="📅" title="No upcoming appointments" text="New bookings will appear here." />
            ) : (
              upcomingList.map(renderAppointmentCard)
            )}
          </div>
        )}

        {consoleTab === "HISTORY" && (
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

        {consoleTab === "CANCELLED" && (
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
                        <div className="bold small">{ownerVisibleCustomerName(apt)}</div>
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

      {/* Response Note Modal */}
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
                actionType === "ACCEPT" ? "e.g. See you then! Please keep your gate open."
                : actionType === "REJECT" ? "e.g. Sorry, booked for emergency repairs."
                : "e.g. Sorry, I need to reschedule — please rebook at your convenience."
              }
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              style={{ fontSize: 13, padding: 10 }}
            />
            <div className="row gap-8 end">
              <button className="btn btn-ghost btn-sm" onClick={() => { setActiveApt(null); setActionType(null); }}>Back</button>
              <button
                className={`btn btn-sm ${actionType === "ACCEPT" ? "btn-green" : "btn-primary"}`}
                style={actionType === "CANCEL" ? { background: "var(--red-600)", color: "#fff" } : undefined}
                onClick={handleUpdateStatus}
              >
                {actionType === "ACCEPT" ? "Confirm" : actionType === "REJECT" ? "Decline" : "Cancel appointment"}
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
      {previewPhoto && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setPreviewPhoto(null)}>
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
            <img src={previewPhoto} alt="Attachment Preview" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, objectFit: "contain" }} />
            <button className="icon-btn" style={{ position: "absolute", top: -12, right: -12, background: "#fff", color: "#000" }} onClick={() => setPreviewPhoto(null)}><XIcon size={18} /></button>
          </div>
        </div>
      )}

      <ProviderManageNav pid={id} />
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="col" style={{ gap: 1 }}>
      <div className="bold" style={{ fontSize: 15, color: "var(--brand-800)" }}>{value}</div>
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
