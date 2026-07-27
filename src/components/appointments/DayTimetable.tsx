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
  /** Resolves a booking's real slot capacity from its package_id (catalog
   *  item capacity, falling back to the business default) — the day view
   *  mixes every service together, so capacity is resolved per-booking here
   *  rather than passed as one blanket value to generateWorkingSlots (that
   *  path is for the single-service customer booking sheet). Omit to treat
   *  every slot as capacity 1, matching a business that hasn't set any. */
  resolveCapacity?: (packageId: string | null) => number;
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
  resolveCapacity,
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
  // A shared slot (capacity > 1) holds several bookings behind one block —
  // this lists them so booking 2..N are reachable, not just the first.
  const [slotList, setSlotList] = useState<AppointmentRecord[] | null>(null);
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
            // A slot can hold several bookings once the business sets a
            // capacity > 1, so resolve the whole set. `apt` stays the first for
            // the single-booking layout below; extras get a "+N" affordance.
            const slotApts = (s.bookedAppointmentIds ?? [])
              .map((id) => appointments.find((a) => a.id === id))
              .filter((a): a is AppointmentRecord => !!a);
            const apt = slotApts[0];
            const extraCount = slotApts.length - 1;
            // generateWorkingSlots has no per-service capacity here (this view
            // mixes every service in one day, unlike the customer sheet), so
            // s.capacity is always 1 — resolve the real number from the
            // booking's own package instead.
            const effectiveCapacity = apt ? (resolveCapacity?.(apt.packageId ?? null) ?? 1) : 1;
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
                  // A shared slot opens a picker listing every booking; a
                  // normal single-booking slot opens straight to the card as
                  // before — no added tap for the common case.
                  onClick={() => (slotApts.length > 1 ? setSlotList(slotApts) : setExpandedApt(apt))}
                >
                  {compact ? (
                    <>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.fg, flexShrink: 0 }} />
                      <span className="tiny semi ellipsis" style={{ color: colors.fg, fontSize: 10 }}>
                        {s.timeLabel} · {apt.customerName}{extraCount > 0 ? ` +${extraCount}` : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="tiny semi" style={{ color: colors.fg, fontSize: 10.5 }}>{s.timeLabel}</span>
                      <span className="tiny bold ellipsis" style={{ color: colors.fg, maxWidth: "100%" }}>
                        {apt.customerName}{extraCount > 0 ? ` +${extraCount} more` : ""}
                      </span>
                    </>
                  )}
                  {/* Fill-rate marker — shown whenever this booking's service
                      has real capacity (>1), not just once it's actually
                      shared, so a high-capacity slot with only 1 booking still
                      reads as "1/5" rather than looking identical to a
                      capacity-1 slot. */}
                  {effectiveCapacity > 1 && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute", top: 3, right: 4,
                        fontSize: 8.5, fontWeight: 700, color: colors.fg, opacity: 0.75,
                      }}
                    >
                      {slotApts.length}/{effectiveCapacity}
                    </span>
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
            // half-hour" problem entirely. No fill-rate hint here: an empty
            // slot isn't tied to any one service yet, so there's no single
            // capacity to resolve until it actually has a booking.
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

      {/* Shared slot (capacity > 1) — pick which booking to open. */}
      {slotList && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSlotList(null)}>
          <div className="card col gap-8" style={{ width: "100%", maxWidth: 360, padding: 14, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div className="row between center-v" style={{ marginBottom: 2 }}>
              <span className="bold small">{slotList.length} bookings at {slotList[0]?.timeLabel}</span>
              <button onClick={() => setSlotList(null)}><XIcon size={16} color="var(--ink-400)" /></button>
            </div>
            {slotList.map((a) => {
              const colors = STATUS_COLOR[a.status] ?? STATUS_COLOR.PENDING;
              const needsAttention = a.status === "PENDING" || a.paymentStatus === "PENDING_CONFIRM";
              return (
                <button
                  key={a.id}
                  type="button"
                  className="row between center-v"
                  style={{ padding: "10px 12px", borderRadius: 10, background: colors.bg, border: `1.5px solid ${needsAttention ? colors.border : "transparent"}`, textAlign: "left" }}
                  onClick={() => { setExpandedApt(a); setSlotList(null); }}
                >
                  <span className="tiny semi ellipsis" style={{ color: colors.fg }}>{a.customerName}</span>
                  <span className="tiny" style={{ color: colors.fg, opacity: 0.8 }}>{a.status === "PENDING" ? "Needs response" : a.status}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
