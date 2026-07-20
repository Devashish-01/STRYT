import { useEffect, useRef } from "react";
import { CalendarClock } from "@/components/Icons";
import { dateKey, matchBlockedSlotsForDate } from "@/utils/availability";
import type { AppointmentRecord, BlockedSlot } from "@/types";

interface DateStripProps {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  appointments: AppointmentRecord[];
  blockedSlots?: BlockedSlot[];
  daysBefore?: number;
  daysAfter?: number;
}

type DayStatus = "none" | "confirmed" | "pending" | "blocked";

/** Horizontally scrollable date strip with a status-coded dot per day (pending
 *  outranks blocked outranks confirmed-only, since pending is what most needs
 *  the owner's attention), a month/weekday label for the current selection,
 *  and a "Today" jump button once scrolled away from today. */
export default function DateStrip({ selectedDate, onSelect, appointments, blockedSlots = [], daysBefore = 7, daysAfter = 7 }: DateStripProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOnToday = dateKey(selectedDate) === dateKey(today);

  const dates = Array.from({ length: daysBefore + daysAfter + 1 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysBefore + i);
    return d;
  });

  const statusByDay = new Map<string, DayStatus>();
  for (const apt of appointments) {
    if (apt.status === "CANCELLED" || apt.status === "REJECTED") continue;
    try {
      const key = dateKey(new Date(apt.scheduledForISO));
      const isPending = apt.status === "PENDING" || apt.paymentStatus === "PENDING_CONFIRM";
      if (isPending) statusByDay.set(key, "pending");
      else if (statusByDay.get(key) !== "pending") statusByDay.set(key, "confirmed");
    } catch {}
  }
  for (const d of dates) {
    const key = dateKey(d);
    if (statusByDay.get(key) === "pending") continue; // already the highest-priority signal
    if (matchBlockedSlotsForDate(d, blockedSlots).length > 0) statusByDay.set(key, "blocked");
  }

  const DOT_COLOR: Record<DayStatus, string> = {
    none: "transparent",
    confirmed: "var(--green-500)",
    pending: "var(--amber-500)",
    blocked: "var(--red-500)",
  };

  const btnRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = dateKey(selectedDate);
    btnRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey(selectedDate)]);

  return (
    <div className="col gap-6">
      <div className="row between center-v">
        <span className="tiny bold" style={{ color: "var(--ink-600)" }}>
          {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
        {!isOnToday && (
          <button
            type="button"
            className="row gap-4 center-v tiny semi"
            style={{ color: "var(--brand-700)", background: "var(--brand-50)", padding: "3px 8px", borderRadius: 8 }}
            onClick={() => onSelect(new Date(today))}
          >
            <CalendarClock size={11} /> Today
          </button>
        )}
      </div>

      <div ref={scrollerRef} className="row gap-6" style={{ overflowX: "auto", padding: "2px 2px 8px" }}>
        {dates.map((d) => {
          const key = dateKey(d);
          const isSelected = dateKey(selectedDate) === key;
          const isToday = dateKey(today) === key;
          const status = statusByDay.get(key) ?? "none";
          return (
            <button
              key={key}
              ref={(el) => { if (el) btnRefs.current.set(key, el); else btnRefs.current.delete(key); }}
              type="button"
              onClick={() => onSelect(d)}
              className="col center"
              style={{
                flexShrink: 0,
                width: 50,
                padding: "8px 0 7px",
                borderRadius: 14,
                border: isSelected ? "2px solid var(--brand-600)" : isToday ? "1.5px solid var(--brand-200)" : "1px solid var(--ink-200)",
                background: isSelected ? "var(--brand-50)" : "#fff",
                gap: 3,
              }}
            >
              <span className="tiny muted" style={{ fontSize: 9.5 }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
              <span className="bold" style={{ fontSize: 15, color: isSelected ? "var(--brand-700)" : isToday ? "var(--brand-600)" : "var(--ink-900)" }}>
                {d.getDate()}
              </span>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: isSelected && status !== "none" ? "var(--brand-600)" : DOT_COLOR[status] }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
