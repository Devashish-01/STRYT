import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Plus, X, Zap, Clock } from "lucide-react";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { evaluateProviderAvailability, calculateNextTurnoffTime } from "@/utils/availability";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DayHours {
  open: boolean;
  from: string;
  to: string;
}

/** Serialize the per-day UI state into a compact human-readable string stored in DB. */
function serialize(is24x7: boolean, hours: Record<string, DayHours>, slotDuration: number): string {
  let main = "";
  if (is24x7) {
    main = "Open 24×7";
  } else {
    main = days
      .map((d) => {
        const h = hours[d];
        return h.open ? `${d} ${h.from}–${h.to}` : `${d} Closed`;
      })
      .join(", ");
  }
  return `${main}|duration=${slotDuration}`;
}

/** Parse a stored string back into per-day state. Falls back to defaults. */
function parse(raw: string | undefined): { is24x7: boolean; hours: Record<string, DayHours>; slotDuration: number } {
  const defaults = Object.fromEntries(days.map((d) => [d, { open: true, from: "11:00", to: "23:30" }]));
  if (!raw) return { is24x7: false, hours: defaults, slotDuration: 30 };
  
  const parts = raw.split("|");
  const mainPart = parts[0]?.trim() || "";
  const configPart = parts[1];
  
  let slotDuration = 30;
  if (configPart && configPart.includes("duration=")) {
    const match = configPart.match(/duration=(\d+)/);
    if (match) slotDuration = parseInt(match[1], 10);
  }

  if (mainPart === "Open 24×7") return { is24x7: true, hours: defaults, slotDuration };
  const result = { ...defaults };
  for (const chunk of mainPart.split(", ")) {
    for (const d of days) {
      if (chunk.startsWith(d + " Closed")) {
        result[d] = { open: false, from: "11:00", to: "23:30" };
        break;
      }
      const m = chunk.match(new RegExp(`^${d} (\\d{2}:\\d{2})[–-](\\d{2}:\\d{2})$`));
      if (m) {
        result[d] = { open: true, from: m[1], to: m[2] };
        break;
      }
    }
  }
  return { is24x7: false, hours: result, slotDuration };
}

export default function HoursEditor() {
  const { id = "b1" } = useParams();
  const { showToast } = useApp();
  const { data: b } = useQuery(() => businessService.get(id), [id]);

  const [is24x7, setIs24x7] = useState(false);
  const [hours, setHours] = useState<Record<string, DayHours>>(
    Object.fromEntries(days.map((d) => [d, { open: true, from: "11:00", to: "23:30" }]))
  );
  const [slotDuration, setSlotDuration] = useState(30);
  const [special, setSpecial] = useState<{ date: string; note: string }[]>([]);
  const [newSpecial, setNewSpecial] = useState("");
  const [saving, setSaving] = useState(false);
  const [openNow, setOpenNow] = useState(false);

  // Seed form state from live business once loaded.
  useEffect(() => {
    if (!b) return;
    const parsed = parse(b.hours);
    setIs24x7(parsed.is24x7);
    setHours(parsed.hours);
    setSlotDuration(parsed.slotDuration);
    setOpenNow(b.isAvailableNow ?? false);
  }, [b]);

  const evalRes = evaluateProviderAvailability(b?.hours, openNow, b?.availableUntil);

  // Presence toggle: "open right now" is separate from bookable slots — a
  // customer can still book a future working-hour slot when this is off.
  async function toggleOpenNow() {
    const prev = openNow;
    const next = !openNow;
    setOpenNow(next);
    try {
      if (next && !evalRes.isOpenNow) {
        // Turning ON outside working hours → auto-clear at next closing time.
        const turnoff = calculateNextTurnoffTime(b?.hours);
        await businessService.setAvailability(id, true, turnoff.toISOString());
        showToast(`Open now — clears at ${turnoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ⚡`);
      } else {
        await businessService.setAvailability(id, next, null);
        showToast(next ? "Shop marked open right now ⚡" : "Shop marked closed");
      }
    } catch (e: any) {
      setOpenNow(prev);
      showToast(e?.message ?? "Couldn't update availability");
    }
  }

  function setDay(d: string, patch: Partial<DayHours>) {
    setHours((h) => ({ ...h, [d]: { ...h[d], ...patch } }));
  }

  async function save() {
    setSaving(true);
    try {
      await businessService.update(id, { hours: serialize(is24x7, hours, slotDuration) });
      showToast("Hours saved");
    } catch {
      showToast("Couldn't save hours. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const firstOpenDay = days.find((d) => hours[d]?.open);
  const maxSlots = firstOpenDay
    ? (() => {
        const h = hours[firstOpenDay];
        const parseTimeToMin = (t: string) => {
          const parts = t.split(":");
          return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        };
        const total = parseTimeToMin(h.to) - parseTimeToMin(h.from);
        return total > 0 ? Math.floor(total / slotDuration) : 0;
      })()
    : 0;

  // What customers see on the public page (same string that gets stored).
  const previewText = is24x7
    ? "Open 24×7"
    : days.map((d) => (hours[d].open ? `${d} ${hours[d].from}–${hours[d].to}` : `${d} Closed`)).join(", ");

  return (
    <div className="screen">
      <AppBar title="Hours & Availability" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {/* ── Instant availability banner (presence — separate from bookable slots) ── */}
        <div className="card" style={{ padding: 16, background: openNow ? "#e8f7ee" : "var(--ink-50)", border: "none" }}>
          <div className="row between center-v">
            <div className="row gap-10 center-v">
              <Zap size={22} color={openNow ? "#16a34a" : "var(--ink-400)"} />
              <div>
                <div className="semi small">Shop open right now</div>
                <div className="tiny muted">{openNow ? "Customers see your shop as open" : "Turn on when you're open for walk-ins"}</div>
              </div>
            </div>
            <button
              onClick={toggleOpenNow}
              style={{ width: 48, height: 28, borderRadius: 999, background: openNow ? "var(--green-500)" : "var(--ink-200)", position: "relative", border: "none", cursor: "pointer" }}
            >
              <span style={{ position: "absolute", top: 3, left: openNow ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </button>
          </div>
          <div className="row gap-6 center-v tiny muted" style={{ marginTop: 10 }}>
            <Clock size={12} /> Appointments can still be booked for your working hours even when this is off.
          </div>
        </div>

        {/* ── Working Hours (Availability Timing) ── */}
        <div className="card col gap-14" style={{ padding: 16 }}>
          <div className="bold small row gap-6 center-v" style={{ color: "var(--ink-900)" }}>
            <Clock size={18} color="var(--brand-700)" /> Working Hours (Availability Timing)
          </div>

          {/* Open 24×7 */}
          <button
            className="row between center-v"
            style={{ padding: "10px 12px", borderRadius: 12, background: "#fff", width: "100%", border: is24x7 ? "2px solid var(--brand-500)" : "1px solid var(--line)" }}
            onClick={() => setIs24x7((v) => !v)}
          >
            <span className="semi small">Open 24×7</span>
            <span style={{ width: 44, height: 26, borderRadius: 999, background: is24x7 ? "var(--brand-600)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 3, left: is24x7 ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </span>
          </button>

          {/* Per-day open/close (richer than the provider's single pattern) */}
          {!is24x7 && (
            <div className="field">
              <label className="tiny semi muted">Available Days & Hours</label>
              <div className="card" style={{ overflow: "hidden", marginTop: 6 }}>
                {days.map((d, i) => {
                  const h = hours[d];
                  return (
                    <div key={d} className="row gap-10" style={{ padding: "12px 14px", borderBottom: i < days.length - 1 ? "1px solid var(--line)" : "none" }}>
                      <span className="semi small" style={{ width: 36 }}>{d}</span>
                      <button
                        onClick={() => setDay(d, { open: !h.open })}
                        style={{ width: 40, height: 24, borderRadius: 999, background: h.open ? "var(--green-500)" : "var(--ink-200)", position: "relative", flexShrink: 0 }}
                      >
                        <span style={{ position: "absolute", top: 3, left: h.open ? 19 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
                      </button>
                      {h.open ? (
                        <div className="row gap-6 grow" style={{ justifyContent: "flex-end" }}>
                          <input className="input" style={{ width: 80, padding: "8px 8px", textAlign: "center" }} type="time" value={h.from} onChange={(e) => setDay(d, { from: e.target.value })} />
                          <span className="muted">–</span>
                          <input className="input" style={{ width: 80, padding: "8px 8px", textAlign: "center" }} type="time" value={h.to} onChange={(e) => setDay(d, { to: e.target.value })} />
                        </div>
                      ) : (
                        <span className="grow tiny muted" style={{ textAlign: "right" }}>Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Slot duration & max appointments */}
          <div className="row gap-12">
            <div className="field grow">
              <label className="tiny semi muted">Appointment Slot Duration</label>
              <select
                className="input"
                value={slotDuration}
                onChange={(e) => setSlotDuration(Number(e.target.value))}
                style={{ fontSize: 13, padding: "10px 12px", width: "100%" }}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes (1 hr)</option>
                <option value={90}>90 minutes (1.5 hrs)</option>
                <option value={120}>120 minutes (2 hrs)</option>
              </select>
            </div>

            <div className="field grow">
              <label className="tiny semi muted">Max Appointments / Day</label>
              <div
                className="input"
                style={{ fontSize: 13.5, padding: "10px 12px", background: "var(--ink-50)", fontWeight: 700, display: "flex", alignItems: "center", height: 38 }}
              >
                {is24x7 ? "Continuous" : `${maxSlots} slots`}
              </div>
            </div>
          </div>

          {/* Public profile display preview */}
          <div className="card" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
            <div className="tiny semi muted">Public Profile Display Preview:</div>
            <div className="bold small" style={{ color: "var(--brand-800)", marginTop: 2 }}>🕒 {previewText}</div>
          </div>
        </div>

        {/* Special / holiday hours */}
        <div>
          <div className="small semi muted" style={{ marginBottom: 8 }}>Special / holiday hours</div>
          <div className="col gap-8">
            {special.map((s, i) => (
              <div key={i} className="card row between" style={{ padding: 12 }}>
                <div><div className="semi small">{s.date}</div><div className="tiny muted">{s.note}</div></div>
                <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setSpecial((p) => p.filter((_, j) => j !== i))}><X size={15} /></button>
              </div>
            ))}
            <div className="row gap-8">
              <input className="input grow" placeholder="e.g. Holi (14 Mar) — Closed" value={newSpecial} onChange={(e) => setNewSpecial(e.target.value)} />
              <button className="btn btn-ghost btn-sm" disabled={!newSpecial.trim()} onClick={() => { setSpecial((p) => [...p, { date: newSpecial, note: "" }]); setNewSpecial(""); }}>
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button className="btn btn-primary btn-block" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save Working Timing"}
        </button>
      </div>
    </div>
  );
}
