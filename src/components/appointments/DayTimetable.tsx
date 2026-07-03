import { Lock, Plus, Unlock } from "lucide-react";
import { generateWorkingSlots, matchBlockedSlotsForDate, dateKey } from "@/utils/availability";
import type { AppointmentRecord, BlockedSlot } from "@/types";

interface DayTimetableProps {
  date: Date;
  availabilityNote: string;
  appointments: AppointmentRecord[];
  blockedSlots: BlockedSlot[];
  renderAppointment: (apt: AppointmentRecord) => React.ReactNode;
  onBlockSlot: (date: Date, timeLabel: string) => void;
  onUnblockSlot: (block: BlockedSlot) => void;
  onAddWalkIn: (date: Date, timeLabel: string) => void;
  onBlockWholeDay: () => void;
  onUnblockWholeDay: (block: BlockedSlot) => void;
}

/** Vertical, top-to-bottom timetable for a single day: booked / blocked / open / past slots. */
export default function DayTimetable({
  date, availabilityNote, appointments, blockedSlots,
  renderAppointment, onBlockSlot, onUnblockSlot, onAddWalkIn, onBlockWholeDay, onUnblockWholeDay,
}: DayTimetableProps) {
  const isTargetToday = dateKey(date) === dateKey(new Date());
  const slots = generateWorkingSlots(availabilityNote, date, appointments, blockedSlots);
  const dayBlocks = matchBlockedSlotsForDate(date, blockedSlots);
  const wholeDayBlock = dayBlocks.find((b) => !b.timeLabel);

  if (wholeDayBlock) {
    return (
      <div className="card col center" style={{ padding: 28, gap: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
        <Lock size={26} color="var(--red-600)" />
        <div className="semi small" style={{ color: "#991b1b" }}>Closed — blocked for the whole day</div>
        {wholeDayBlock.reason && <div className="tiny muted center" style={{ maxWidth: 220 }}>"{wholeDayBlock.reason}"</div>}
        <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => onUnblockWholeDay(wholeDayBlock)}>
          <Unlock size={13} /> Unblock this day
        </button>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="card col center" style={{ padding: 28, gap: 8, background: "var(--ink-50)" }}>
        <span style={{ fontSize: 24 }}>😴</span>
        <div className="semi small">Not a working day</div>
        <div className="tiny muted center" style={{ maxWidth: 220 }}>No hours set for this day — update Hours to take bookings.</div>
      </div>
    );
  }

  const now = Date.now();
  const nowLineIdx = isTargetToday ? slots.findIndex((s) => new Date(s.isoTimestamp).getTime() > now) : -1;

  return (
    <div className="col gap-6">
      <button
        className="row gap-6 center-v"
        style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--red-600)", fontWeight: 600, padding: "4px 8px" }}
        onClick={onBlockWholeDay}
      >
        <Lock size={12} /> Block whole day
      </button>

      {slots.map((s, i) => {
        const apt = s.bookedAppointmentId ? appointments.find((a) => a.id === s.bookedAppointmentId) : undefined;
        const isPast = new Date(s.isoTimestamp).getTime() <= now;
        const rowKey = s.id;

        const row = (() => {
          if (apt) {
            return <div key={rowKey}>{renderAppointment(apt)}</div>;
          }
          if (s.blocked) {
            const block = dayBlocks.find((b) => b.timeLabel === s.timeLabel);
            return (
              <div key={rowKey} className="row gap-10 center-v" style={{ padding: "10px 12px", borderRadius: 12, background: "#fef2f2", border: "1px dashed #fca5a5" }}>
                <Lock size={14} color="var(--red-600)" style={{ flexShrink: 0 }} />
                <div className="grow">
                  <div className="tiny semi" style={{ color: "#991b1b" }}>{s.timeLabel} — blocked</div>
                  {s.blockReason && <div className="tiny muted">"{s.blockReason}"</div>}
                </div>
                {block && (
                  <button className="tiny semi" style={{ color: "var(--brand-700)" }} onClick={() => onUnblockSlot(block)}>Unblock</button>
                )}
              </div>
            );
          }
          if (isPast) {
            return (
              <div key={rowKey} className="row center-v" style={{ padding: "8px 12px", opacity: 0.5 }}>
                <span className="tiny muted">{s.timeLabel} — passed</span>
              </div>
            );
          }
          // Open, bookable slot
          return (
            <div key={rowKey} className="row gap-8 center-v" style={{ padding: "9px 12px", borderRadius: 12, border: "1px dashed var(--ink-200)" }}>
              <span className="tiny semi grow" style={{ color: "var(--ink-500)" }}>{s.timeLabel} — open</span>
              <button
                className="row gap-4 center-v tiny semi"
                style={{ color: "var(--brand-700)", background: "var(--brand-50)", padding: "4px 8px", borderRadius: 8 }}
                onClick={() => onAddWalkIn(date, s.timeLabel)}
              >
                <Plus size={11} /> Walk-in
              </button>
              <button
                className="row gap-4 center-v tiny semi"
                style={{ color: "var(--red-600)", background: "#fef2f2", padding: "4px 8px", borderRadius: 8 }}
                onClick={() => onBlockSlot(date, s.timeLabel)}
              >
                <Lock size={11} /> Block
              </button>
            </div>
          );
        })();

        return (
          <div key={rowKey}>
            {i === nowLineIdx && (
              <div className="row gap-8 center-v" style={{ margin: "2px 0" }}>
                <span style={{ flex: 1, height: 1.5, background: "var(--orange-500)" }} />
                <span className="tiny bold" style={{ color: "var(--orange-500)" }}>NOW</span>
                <span style={{ flex: 1, height: 1.5, background: "var(--orange-500)" }} />
              </div>
            )}
            {row}
          </div>
        );
      })}
    </div>
  );
}
