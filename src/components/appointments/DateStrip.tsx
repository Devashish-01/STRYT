import { dateKey } from "@/utils/availability";
import type { AppointmentRecord } from "@/types";

interface DateStripProps {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  appointments: AppointmentRecord[];
  daysBefore?: number;
  daysAfter?: number;
}

/** Horizontally scrollable date strip with a live/upcoming booking-count dot per day. */
export default function DateStrip({ selectedDate, onSelect, appointments, daysBefore = 7, daysAfter = 7 }: DateStripProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = Array.from({ length: daysBefore + daysAfter + 1 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysBefore + i);
    return d;
  });

  const countByDay = new Map<string, number>();
  for (const apt of appointments) {
    if (apt.status === "CANCELLED" || apt.status === "REJECTED") continue;
    try {
      const key = dateKey(new Date(apt.scheduledForISO));
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    } catch {}
  }

  return (
    <div className="row gap-6" style={{ overflowX: "auto", padding: "2px 2px 8px" }}>
      {dates.map((d) => {
        const key = dateKey(d);
        const isSelected = dateKey(selectedDate) === key;
        const isToday = dateKey(today) === key;
        const count = countByDay.get(key) ?? 0;
        return (
          <button
            key={key}
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
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: count > 0 ? (isSelected ? "var(--brand-600)" : "var(--green-500)") : "transparent" }} />
          </button>
        );
      })}
    </div>
  );
}
