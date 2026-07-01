import { useEffect, useState } from "react";
import { Clock, Calendar } from "lucide-react";

interface HoursSelectorProps {
  value: string;
  onChange: (val: string) => void;
  accentColor?: string; // Default: "var(--brand-600)"
  label?: string; // Default: "Hours"
  description?: string; // Default: "Specify timing"
}

const DAYS_PRESETS = [
  { label: "Everyday", value: "Everyday" },
  { label: "Mon – Sat", value: "Mon–Sat" },
  { label: "Mon – Fri", value: "Mon–Fri" },
  { label: "Weekends Only", value: "Sat–Sun" },
];

// Generate 30-minute intervals from 12:00 AM to 11:30 PM
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of ["00", "30"]) {
    const hour12 = h % 12 || 12;
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = hour12 < 10 ? `0${hour12}` : `${hour12}`;
    TIME_OPTIONS.push(`${displayH}:${m} ${ampm}`);
  }
}

export function normalizeTimeStr(tStr: string): string {
  if (!tStr) return "09:00 AM";
  const cleaned = tStr.trim().toUpperCase();
  
  // Check if PM/AM is present, if not infer from hour
  const hasPM = cleaned.includes("PM");
  const hasAM = cleaned.includes("AM");
  
  const numPart = cleaned.replace(/(AM|PM)/g, "").trim();
  const parts = numPart.split(":");
  let hour = parseInt(parts[0], 10) || 0;
  let minute = parseInt(parts[1], 10) || 0;
  
  const isPM = hasPM || (hour >= 12 && !hasAM);
  
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  const displayHStr = displayHour < 10 ? `0${displayHour}` : `${displayHour}`;
  const displayMStr = minute < 10 ? `0${minute}` : `${minute}`;
  const ampm = isPM ? "PM" : "AM";
  
  return `${displayHStr}:${displayMStr} ${ampm}`;
}

export function parseAvailability(raw: string | undefined): { days: string; from: string; to: string } {
  const defaults = { days: "Everyday", from: "09:00 AM", to: "09:00 PM" };
  if (!raw) return defaults;
  
  let main = raw.trim();
  if (main.includes("duration=")) {
    const pipeIdx = main.lastIndexOf("|");
    if (pipeIdx !== -1) {
      main = main.substring(0, pipeIdx).trim();
    }
  }
  
  if (main.includes("from ") && main.includes(" to ")) {
    const parts = main.split(" from ");
    const daysPattern = parts[0]?.trim() || "Everyday";
    const times = parts[1]?.split(" to ");
    const fromTime = normalizeTimeStr(times?.[0] || "09:00 AM");
    const toTime = normalizeTimeStr(times?.[1] || "09:00 PM");
    return { days: daysPattern, from: fromTime, to: toTime };
  }
  
  if (main.includes("|")) {
    const parts = main.split("|");
    const daysPattern = parts[0]?.trim() || "Everyday";
    const times = (parts[1] || "").split(/-|–/);
    const fromTime = normalizeTimeStr(times?.[0] || "09:00 AM");
    const toTime = normalizeTimeStr(times?.[1] || "09:00 PM");
    return { days: daysPattern, from: fromTime, to: toTime };
  }
  
  if (main.includes("-") || main.includes("–")) {
    const sep = main.includes("–") ? "–" : "-";
    const parts = main.split(sep);
    const daysPattern = parts[0]?.trim() || "Everyday";
    const times = (parts[1] || "").split(/-|–/);
    const fromTime = normalizeTimeStr(times?.[0] || "09:00 AM");
    const toTime = normalizeTimeStr(times?.[1] || "09:00 PM");
    return { days: daysPattern, from: fromTime, to: toTime };
  }
  
  return defaults;
}

export default function HoursSelector({
  value,
  onChange,
  accentColor = "var(--brand-600)",
  label = "Hours",
  description = "Specify open and close hours"
}: HoursSelectorProps) {
  const parsed = parseAvailability(value);
  const [daysPattern, setDaysPattern] = useState(parsed.days);
  const [fromTime, setFromTime] = useState(parsed.from);
  const [toTime, setToTime] = useState(parsed.to);

  // Sync state with incoming value
  useEffect(() => {
    const nextParsed = parseAvailability(value);
    setDaysPattern(nextParsed.days);
    setFromTime(nextParsed.from);
    setToTime(nextParsed.to);
  }, [value]);

  // Propagate changes when internal state changes
  const updateTiming = (days: string, from: string, to: string) => {
    const formatted = `${days} from ${from} to ${to}`;
    onChange(formatted);
  };

  return (
    <div className="card col gap-12" style={{ padding: 14 }}>
      <div className="col gap-2">
        <span className="semi small" style={{ color: "var(--ink-900)" }}>{label}</span>
        {description && <span className="tiny muted">{description}</span>}
      </div>

      {/* Days selector */}
      <div className="col gap-6">
        <div className="row wrap gap-8">
          {DAYS_PRESETS.map((d) => {
            const active = daysPattern === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => {
                  setDaysPattern(d.value);
                  updateTiming(d.value, fromTime, toTime);
                }}
                className={`chip ${active ? "active" : ""}`}
                style={{
                  fontSize: 12,
                  padding: "6px 12px",
                  borderColor: active ? accentColor : "var(--line)",
                  background: active ? `${accentColor}12` : "transparent",
                  color: active ? accentColor : "var(--ink-700)",
                }}
              >
                <Calendar size={12} style={{ marginRight: 4 }} /> {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time range selection */}
      <div className="row gap-12">
        <div className="field grow">
          <label className="tiny semi muted">Open From</label>
          <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff", marginTop: 4 }}>
            <Clock size={14} color="var(--ink-400)" style={{ flexShrink: 0 }} />
            <select
              className="input"
              value={fromTime}
              onChange={(e) => {
                setFromTime(e.target.value);
                updateTiming(daysPattern, e.target.value, toTime);
              }}
              style={{
                fontSize: 13,
                border: "none",
                padding: "8px 4px",
                background: "transparent",
                outline: "none"
              }}
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field grow">
          <label className="tiny semi muted">Open Until</label>
          <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff", marginTop: 4 }}>
            <Clock size={14} color="var(--ink-400)" style={{ flexShrink: 0 }} />
            <select
              className="input"
              value={toTime}
              onChange={(e) => {
                setToTime(e.target.value);
                updateTiming(daysPattern, fromTime, e.target.value);
              }}
              style={{
                fontSize: 13,
                border: "none",
                padding: "8px 4px",
                background: "transparent",
                outline: "none"
              }}
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Realtime summary preview */}
      <div className="row gap-6 center-v" style={{ background: "var(--ink-50)", padding: "8px 12px", borderRadius: 8 }}>
        <span className="tiny semi" style={{ color: "var(--ink-600)" }}>Selected:</span>
        <span className="tiny bold" style={{ color: accentColor }}>
          {daysPattern} from {fromTime} to {toTime}
        </span>
      </div>
    </div>
  );
}
