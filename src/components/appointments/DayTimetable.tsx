import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Lock, Plus, Unlock, X as XIcon, Clock } from "@/components/Icons";
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

// Pixels per minute of the working day — a 30-min slot renders at ~46px (a
// comfortable tap target, close to native calendar apps); a 60-min slot at
// ~92px. Proportional to real time, not slot count, which is the whole point
// of a grid over a flat list: the shape of a busy vs. quiet day is visible
// before you scroll a single pixel.
const PX_PER_MIN = 1.55;
// Below this rendered height a slot switches to a compact, text-light block —
// keeps very short slot durations (e.g. duration=15) legible instead of
// clipping a name mid-word.
const COMPACT_BELOW_PX = 34;

function minuteOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

const STATUS_COLOR: Record<string, { bg: string; fg: string; border: string }> = {
  PENDING: { bg: "var(--brand-100)", fg: "var(--brand-700)", border: "var(--brand-300)" },
  ACCEPTED: { bg: "var(--green-100)", fg: "var(--green-600)", border: "var(--green-500)" },
  COMPLETED: { bg: "var(--green-100)", fg: "var(--green-600)", border: "var(--green-500)" },
  NO_SHOW: { bg: "var(--red-100)", fg: "var(--red-600)", border: "var(--red-500)" },
  REJECTED: { bg: "var(--ink-100)", fg: "var(--ink-600)", border: "var(--ink-200)" },
  CANCELLED: { bg: "var(--ink-100)", fg: "var(--ink-600)", border: "var(--ink-200)" },
};

/** Proportional, single-lane hour-grid for one day: booked/blocked/open time
 *  rendered as absolutely-positioned blocks against a fixed time axis, like a
 *  native calendar app's day view — not a flat list. Tapping a block reveals
 *  the relevant action surface (full appointment card, unblock, or a quick
 *  walk-in/block sheet) rather than showing everything inline at all times,
 *  which is what keeps a busy day scannable instead of a long scroll of
 *  identical-looking rows. */
export default function DayTimetable({
  date, availabilityNote, appointments, blockedSlots,
  renderAppointment, onBlockSlot, onUnblockSlot, onAddWalkIn, onBlockWholeDay, onUnblockWholeDay,
}: DayTimetableProps) {
  const isTargetToday = dateKey(date) === dateKey(new Date());
  const slots = useMemo(
    () => generateWorkingSlots(availabilityNote, date, appointments, blockedSlots),
    [availabilityNote, date, appointments, blockedSlots]
  );
  const dayBlocks = matchBlockedSlotsForDate(date, blockedSlots);
  const wholeDayBlock = dayBlocks.find((b) => !b.timeLabel);

  const nowRef = useRef<HTMLDivElement>(null);
  const [expandedApt, setExpandedApt] = useState<AppointmentRecord | null>(null);
  const [blockedPopup, setBlockedPopup] = useState<BlockedSlot | null>(null);
  const [quickAction, setQuickAction] = useState<string | null>(null); // timeLabel

  useEffect(() => {
    if (isTargetToday && nowRef.current) {
      const timer = setTimeout(() => {
        nowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [date, isTargetToday, slots.length]);

  if (wholeDayBlock) {
    return (
      <div className="card col center" style={{ padding: 28, gap: 10, background: "var(--red-50)", border: "1px solid var(--red-100)" }}>
        <Lock size={26} color="var(--red-600)" />
        <div className="semi small" style={{ color: "var(--red-600)" }}>Closed — blocked for the whole day</div>
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

  const dayStartMin = minuteOfDay(slots[0].isoTimestamp);
  const slotDurationMin = slots.length >= 2 ? minuteOfDay(slots[1].isoTimestamp) - dayStartMin : 30;
  const dayEndMin = minuteOfDay(slots[slots.length - 1].isoTimestamp) + slotDurationMin;
  const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MIN;
  const slotHeightPx = slotDurationMin * PX_PER_MIN;
  const compact = slotHeightPx < COMPACT_BELOW_PX;

  const now = Date.now();
  const nowMinOfDay = new Date().getHours() * 60 + new Date().getMinutes();
  const nowInRange = isTargetToday && nowMinOfDay >= dayStartMin && nowMinOfDay <= dayEndMin;

  // Whole hours within the working window, for the axis gutter + gridlines.
  const hourTicks: number[] = [];
  for (let h = Math.ceil(dayStartMin / 60) * 60; h <= dayEndMin; h += 60) hourTicks.push(h);

  function hourLabel(min: number): string {
    const h = Math.floor(min / 60);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${period}`;
  }

  return (
    <div className="col gap-6">
      <button
        className="row gap-6 center-v"
        style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--red-600)", fontWeight: 600, padding: "4px 8px" }}
        onClick={onBlockWholeDay}
      >
        <Lock size={12} /> Block whole day
      </button>

      <div className="row" style={{ alignItems: "stretch" }}>
        {/* Hour axis gutter */}
        <div style={{ width: 40, flexShrink: 0, position: "relative", height: totalHeight }}>
          {hourTicks.map((h) => (
            <div
              key={h}
              style={{
                position: "absolute", top: (h - dayStartMin) * PX_PER_MIN - 6,
                right: 6, fontSize: 10, fontWeight: 600, color: "var(--ink-400)",
              }}
            >
              {hourLabel(h)}
            </div>
          ))}
        </div>

        {/* Grid canvas */}
        <div style={{ position: "relative", flex: 1, height: totalHeight, borderLeft: "1.5px solid var(--line)" }}>
          {hourTicks.map((h) => (
            <div
              key={h}
              style={{ position: "absolute", top: (h - dayStartMin) * PX_PER_MIN, left: 0, right: 0, height: 1, background: "var(--line)" }}
            />
          ))}

          {slots.map((s) => {
            const top = (minuteOfDay(s.isoTimestamp) - dayStartMin) * PX_PER_MIN;
            const height = Math.max(slotHeightPx - 2, 14);
            const apt = s.bookedAppointmentId ? appointments.find((a) => a.id === s.bookedAppointmentId) : undefined;
            const isPast = new Date(s.isoTimestamp).getTime() <= now;
            const boxStyle: CSSProperties = {
              position: "absolute", top, left: 4, right: 4, height,
              borderRadius: 8, overflow: "hidden", cursor: "pointer",
            };

            if (apt) {
              const colors = STATUS_COLOR[apt.status] ?? STATUS_COLOR.PENDING;
              const needsAttention = apt.status === "PENDING" || apt.paymentStatus === "PENDING_CONFIRM";
              return (
                <button
                  key={s.id}
                  type="button"
                  style={{
                    ...boxStyle,
                    background: colors.bg, border: `1.5px solid ${needsAttention ? colors.border : "transparent"}`,
                    textAlign: "left", padding: compact ? "2px 6px" : "4px 8px",
                    display: "flex", flexDirection: compact ? "row" : "column",
                    alignItems: compact ? "center" : "flex-start", gap: compact ? 4 : 0, justifyContent: "center",
                  }}
                  onClick={() => setExpandedApt(apt)}
                >
                  {compact ? (
                    <>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.fg, flexShrink: 0 }} />
                      <span className="tiny semi ellipsis" style={{ color: colors.fg, fontSize: 10 }}>{s.timeLabel} · {apt.customerName}</span>
                    </>
                  ) : (
                    <>
                      <span className="tiny semi" style={{ color: colors.fg, fontSize: 10.5 }}>{s.timeLabel}</span>
                      <span className="tiny bold ellipsis" style={{ color: colors.fg, maxWidth: "100%" }}>{apt.customerName}</span>
                    </>
                  )}
                </button>
              );
            }

            if (s.blocked) {
              const block = dayBlocks.find((b) => b.timeLabel === s.timeLabel);
              return (
                <button
                  key={s.id}
                  type="button"
                  style={{
                    ...boxStyle,
                    background: "repeating-linear-gradient(135deg, var(--red-50), var(--red-50) 6px, #fff 6px, #fff 12px)",
                    border: "1px dashed var(--red-100)",
                    display: "flex", alignItems: "center", gap: 4, padding: "0 8px",
                  }}
                  onClick={() => block && setBlockedPopup(block)}
                >
                  <Lock size={10} color="var(--red-600)" style={{ flexShrink: 0 }} />
                  {!compact && <span className="tiny semi ellipsis" style={{ color: "var(--red-600)", fontSize: 10 }}>Blocked</span>}
                </button>
              );
            }

            if (isPast) {
              return <div key={s.id} style={{ ...boxStyle, cursor: "default", background: "var(--ink-50)", opacity: 0.5 }} />;
            }

            // Open, bookable slot — deliberately minimal (just a faint
            // available band), tap opens the walk-in/block quick-action
            // sheet. This is what removes the old "one noisy row per empty
            // half-hour" problem entirely.
            return (
              <button
                key={s.id}
                type="button"
                aria-label={`${s.timeLabel} — open`}
                style={{ ...boxStyle, background: "var(--brand-50)", opacity: 0.55, border: "1px dashed var(--ink-200)" }}
                onClick={() => setQuickAction(s.timeLabel)}
              />
            );
          })}

          {nowInRange && (
            <div ref={nowRef} style={{ position: "absolute", top: (nowMinOfDay - dayStartMin) * PX_PER_MIN, left: -6, right: 0, zIndex: 2, display: "flex", alignItems: "center", gap: 6, pointerEvents: "none" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--orange-500)", flexShrink: 0 }} />
              <span style={{ flex: 1, height: 1.5, background: "var(--orange-500)" }} />
              <span className="tiny bold" style={{ color: "var(--orange-500)", background: "#fff", padding: "0 4px", borderRadius: 4 }}>NOW</span>
            </div>
          )}
        </div>
      </div>

      {/* Tap a booked block — the full appointment card, unchanged, just revealed on demand. */}
      {expandedApt && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }} onClick={() => setExpandedApt(null)}>
          <div className="col" style={{ width: "100%", maxHeight: "85vh", overflowY: "auto", background: "var(--bg)", borderRadius: "20px 20px 0 0", padding: "10px 14px 20px" }} onClick={(e) => e.stopPropagation()}>
            <div className="row center" style={{ padding: "4px 0 10px" }}>
              <span style={{ width: 36, height: 4, borderRadius: 2, background: "var(--ink-200)" }} />
            </div>
            {renderAppointment(expandedApt)}
          </div>
        </div>
      )}

      {/* Tap a blocked block — reason + unblock. */}
      {blockedPopup && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setBlockedPopup(null)}>
          <div className="card col gap-12" style={{ width: "100%", maxWidth: 340, padding: 18, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="row between center-v">
              <div className="row gap-8 center-v"><Lock size={16} color="var(--red-600)" /><span className="bold small">{blockedPopup.timeLabel ?? "Blocked"}</span></div>
              <button onClick={() => setBlockedPopup(null)}><XIcon size={16} color="var(--ink-400)" /></button>
            </div>
            {blockedPopup.reason ? (
              <div className="tiny muted" style={{ fontStyle: "italic" }}>"{blockedPopup.reason}"</div>
            ) : (
              <div className="tiny muted">No reason was given.</div>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => { onUnblockSlot(blockedPopup); setBlockedPopup(null); }}>
              <Unlock size={13} /> Unblock this slot
            </button>
          </div>
        </div>
      )}

      {/* Tap open space — quick walk-in / block actions for that time. */}
      {quickAction && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setQuickAction(null)}>
          <div className="card col gap-10" style={{ width: "100%", maxWidth: 340, padding: 18, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="row between center-v">
              <div className="row gap-8 center-v"><Clock size={16} color="var(--brand-600)" /><span className="bold small">{quickAction}</span></div>
              <button onClick={() => setQuickAction(null)}><XIcon size={16} color="var(--ink-400)" /></button>
            </div>
            <button className="btn btn-primary btn-sm row gap-6 center" onClick={() => { onAddWalkIn(date, quickAction); setQuickAction(null); }}>
              <Plus size={13} /> Add walk-in
            </button>
            <button className="btn btn-outline btn-sm row gap-6 center" style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }} onClick={() => { onBlockSlot(date, quickAction); setQuickAction(null); }}>
              <Lock size={13} /> Block this slot
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
