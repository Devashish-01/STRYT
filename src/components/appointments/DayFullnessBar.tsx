import { useMemo } from "react";
import { generateWorkingSlots } from "@/utils/availability";
import type { AppointmentRecord, BlockedSlot } from "@/types";

interface DayFullnessBarProps {
  date: Date;
  availabilityNote: string;
  appointments: AppointmentRecord[];
  blockedSlots: BlockedSlot[];
}

/** A slim proportional bar — booked / pending / blocked segments against the
 *  day's total working time (the uncovered remainder reads as open) — sitting
 *  next to the summary stats so the shape of the day is visible before
 *  scrolling the grid below. Shares generateWorkingSlots with DayTimetable so
 *  the two never disagree about what a slot's state is. */
export default function DayFullnessBar({ date, availabilityNote, appointments, blockedSlots }: DayFullnessBarProps) {
  const slots = useMemo(
    () => generateWorkingSlots(availabilityNote, date, appointments, blockedSlots),
    [availabilityNote, date, appointments, blockedSlots]
  );

  const { confirmedPct, pendingPct, blockedPct, total } = useMemo(() => {
    let confirmed = 0, pending = 0, blocked = 0;
    for (const s of slots) {
      const apt = s.bookedAppointmentId ? appointments.find((a) => a.id === s.bookedAppointmentId) : undefined;
      if (apt) {
        if (apt.status === "PENDING" || apt.paymentStatus === "PENDING_CONFIRM") pending++;
        else confirmed++;
      } else if (s.blocked) {
        blocked++;
      }
    }
    const t = slots.length;
    return {
      confirmedPct: t ? (confirmed / t) * 100 : 0,
      pendingPct: t ? (pending / t) * 100 : 0,
      blockedPct: t ? (blocked / t) * 100 : 0,
      total: t,
    };
  }, [slots, appointments]);

  if (total === 0) return null;

  return (
    <div style={{ display: "flex", height: 7, borderRadius: 5, overflow: "hidden", width: "100%", background: "var(--ink-100)" }}>
      {confirmedPct > 0 && <div style={{ width: `${confirmedPct}%`, background: "var(--green-500)" }} />}
      {pendingPct > 0 && <div style={{ width: `${pendingPct}%`, background: "var(--amber-500)" }} />}
      {blockedPct > 0 && <div style={{ width: `${blockedPct}%`, background: "var(--red-500)" }} />}
    </div>
  );
}
