import { useState } from "react";
import { Plus, X, Copy, Check, Clock } from "@/components/Icons";
import {
  DAY_CODES,
  parseHoursValue, serializeHoursValue, parseTimeToMinutes, formatWeeklyHoursForDisplay,
} from "@/utils/availability";
import type { DayCode, DaySchedule, WeeklyHours } from "@/utils/availability";

// TimeRange values are always 24hr "HH:MM" (what <input type="time"> requires) — these are
// the editor's own UI-side defaults, distinct from the 12hr DEFAULT_START_TIME/DEFAULT_END_TIME
// constants used for display strings elsewhere.
const UI_DEFAULT_FROM = "09:00";
const UI_DEFAULT_TO = "19:00";
const UI_24X7_FROM = "09:00";
const UI_24X7_TO = "21:00";

interface Props {
  /** Seeds the editor's initial state once. Pass a stable `key` from the parent (e.g. tied to
   *  data-loaded state) so this only re-seeds when you intend a fresh load, not on every render. */
  initialRaw?: string;
  onChange: (raw: string) => void;
}

function cloneSchedule(ds: DaySchedule): DaySchedule {
  return { open: ds.open, ranges: ds.ranges.map((r) => ({ ...r })) };
}

function isUniformWeek(w: WeeklyHours): boolean {
  if (!DAY_CODES.every((d) => w.days[d].open)) return false;
  const key = (d: DayCode) => w.days[d].ranges.map((r) => `${r.from}-${r.to}`).join(",");
  const first = key("Mon");
  return DAY_CODES.every((d) => key(d) === first);
}

function Toggle({ on, onClick, size = "md" }: { on: boolean; onClick: () => void; size?: "md" | "sm" }) {
  const w = size === "sm" ? 40 : 44;
  const h = size === "sm" ? 24 : 26;
  const knob = size === "sm" ? 18 : 20;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: w, height: h, borderRadius: 999, background: on ? "var(--green-500)" : "var(--ink-200)", position: "relative", flexShrink: 0, border: "none", cursor: "pointer" }}
    >
      <span style={{ position: "absolute", top: 3, left: on ? w - knob - 3 : 3, width: knob, height: knob, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
    </button>
  );
}

export default function WeeklyHoursEditor({ initialRaw, onChange }: Props) {
  const [w, setW] = useState<WeeklyHours>(() => parseHoursValue(initialRaw));
  const [savedWeeklyDays, setSavedWeeklyDays] = useState<Record<DayCode, DaySchedule> | null>(null);
  const [perDayMode, setPerDayMode] = useState<boolean>(() => !isUniformWeek(parseHoursValue(initialRaw)));
  const [copyMenuDay, setCopyMenuDay] = useState<DayCode | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<DayCode>>(new Set());

  function commit(next: WeeklyHours) {
    setW(next);
    onChange(serializeHoursValue(next));
  }

  function toggle24x7() {
    if (w.mode === "24x7") {
      commit({ ...w, mode: "weekly", days: savedWeeklyDays ?? w.days });
    } else {
      setSavedWeeklyDays(w.days);
      const days = {} as Record<DayCode, DaySchedule>;
      for (const d of DAY_CODES) days[d] = { open: true, ranges: [{ from: UI_24X7_FROM, to: UI_24X7_TO }] };
      commit({ ...w, mode: "24x7", days });
    }
  }

  function setDaySchedule(d: DayCode, ds: DaySchedule) {
    commit({ ...w, days: { ...w.days, [d]: ds } });
  }

  function setAllDays(ds: DaySchedule) {
    const days = {} as Record<DayCode, DaySchedule>;
    for (const d of DAY_CODES) days[d] = cloneSchedule(ds);
    commit({ ...w, days });
  }

  function switchToPerDay() {
    setPerDayMode(true);
  }

  function switchToSameEveryDay() {
    const sourceDay = DAY_CODES.find((d) => w.days[d].open) ?? "Mon";
    const source = w.days[sourceDay].open ? w.days[sourceDay] : { open: true, ranges: [{ from: UI_DEFAULT_FROM, to: UI_DEFAULT_TO }] };
    setAllDays(source);
    setPerDayMode(false);
  }

  function addRange(d: DayCode) {
    const ds = w.days[d];
    if (ds.ranges.length >= 2) return;
    const lastTo = ds.ranges[ds.ranges.length - 1]?.to ?? UI_DEFAULT_FROM;
    setDaySchedule(d, { open: true, ranges: [...ds.ranges, { from: lastTo, to: UI_DEFAULT_TO }] });
  }

  function removeRange(d: DayCode, i: number) {
    const ds = w.days[d];
    setDaySchedule(d, { ...ds, ranges: ds.ranges.filter((_, idx) => idx !== i) });
  }

  function updateRange(d: DayCode, i: number, patch: Partial<{ from: string; to: string }>) {
    const ds = w.days[d];
    const ranges = ds.ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setDaySchedule(d, { ...ds, ranges });
  }

  function toggleDayOpen(d: DayCode) {
    const ds = w.days[d];
    setDaySchedule(d, ds.open
      ? { open: false, ranges: [] }
      : { open: true, ranges: [{ from: UI_DEFAULT_FROM, to: UI_DEFAULT_TO }] });
  }

  function openCopyMenu(d: DayCode) {
    setCopyMenuDay(d);
    setCopyTargets(new Set());
  }

  function applyCopy() {
    if (!copyMenuDay) return;
    const source = cloneSchedule(w.days[copyMenuDay]);
    const days = { ...w.days };
    for (const d of copyTargets) days[d] = cloneSchedule(source);
    commit({ ...w, days });
    setCopyMenuDay(null);
  }

  const previewText = formatWeeklyHoursForDisplay(w);
  const maxSlotsLabel = (() => {
    if (w.mode === "24x7") return "Continuous";
    const firstOpen = DAY_CODES.find((d) => w.days[d].open && w.days[d].ranges.length > 0);
    if (!firstOpen) return "0 slots";
    const totalMin = w.days[firstOpen].ranges.reduce(
      (sum, r) => sum + Math.max(0, parseTimeToMinutes(r.to) - parseTimeToMinutes(r.from)), 0
    );
    return `${Math.floor(totalMin / w.slotDurationMin)} slots`;
  })();

  return (
    <div className="col gap-14">
      {/* Open 24×7 */}
      <button
        type="button"
        className="row between center-v"
        style={{ padding: "10px 12px", borderRadius: 12, background: "#fff", width: "100%", border: w.mode === "24x7" ? "2px solid var(--brand-500)" : "1px solid var(--line)" }}
        onClick={toggle24x7}
      >
        <span className="semi small">Open 24×7</span>
        <Toggle on={w.mode === "24x7"} onClick={toggle24x7} />
      </button>

      {w.mode !== "24x7" && (
        <>
          {/* Same every day ⇄ Different per day */}
          <div className="row gap-8">
            <button type="button" className={`chip ${!perDayMode ? "active" : ""}`} style={{ flex: 1 }} onClick={switchToSameEveryDay}>
              Same every day
            </button>
            <button type="button" className={`chip ${perDayMode ? "active" : ""}`} style={{ flex: 1 }} onClick={switchToPerDay}>
              Different per day
            </button>
          </div>

          {!perDayMode ? (
            <div className="card" style={{ padding: 12 }}>
              <RangesEditor
                ranges={w.days.Mon.ranges}
                onRemove={(i) => {
                  const next = w.days.Mon.ranges.filter((_, idx) => idx !== i);
                  setAllDays({ open: true, ranges: next.length ? next : [{ from: UI_DEFAULT_FROM, to: UI_DEFAULT_TO }] });
                }}
                onUpdate={(i, patch) => {
                  const next = w.days.Mon.ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
                  setAllDays({ open: true, ranges: next });
                }}
                onAdd={(next) => setAllDays({ open: true, ranges: next })}
              />
            </div>
          ) : (
            <div className="card" style={{ overflow: "hidden" }}>
              {DAY_CODES.map((d, i) => {
                const ds = w.days[d];
                return (
                  <div key={d} style={{ borderBottom: i < DAY_CODES.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <div className="row gap-10" style={{ padding: "12px 14px", alignItems: "flex-start" }}>
                      <span className="semi small" style={{ width: 36, paddingTop: 4 }}>{d}</span>
                      <Toggle size="sm" on={ds.open} onClick={() => toggleDayOpen(d)} />
                      {ds.open ? (
                        <div className="col gap-6 grow">
                          {ds.ranges.map((r, ri) => (
                            <div key={ri} className="row gap-6 center-v">
                              <input className="input" style={{ width: 76, padding: "6px 6px", textAlign: "center", fontSize: 12.5 }} type="time" value={r.from} onChange={(e) => updateRange(d, ri, { from: e.target.value })} />
                              <span className="muted tiny">–</span>
                              <input className="input" style={{ width: 76, padding: "6px 6px", textAlign: "center", fontSize: 12.5 }} type="time" value={r.to} onChange={(e) => updateRange(d, ri, { to: e.target.value })} />
                              {ds.ranges.length > 1 && (
                                <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => removeRange(d, ri)}>
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          ))}
                          {ds.ranges.length < 2 && (
                            <button type="button" className="tiny semi" style={{ color: "var(--brand-600)", textAlign: "left" }} onClick={() => addRange(d)}>
                              <Plus size={11} style={{ marginRight: 2, verticalAlign: -1 }} /> Add second shift
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="grow tiny muted" style={{ textAlign: "right", paddingTop: 5 }}>Closed</span>
                      )}
                      <button type="button" className="icon-btn" style={{ width: 26, height: 26, flexShrink: 0 }} onClick={() => openCopyMenu(d)} title={`Copy ${d}'s hours to other days`}>
                        <Copy size={13} />
                      </button>
                    </div>

                    {copyMenuDay === d && (
                      <div className="col gap-8" style={{ padding: "0 14px 14px 60px" }}>
                        <div className="tiny muted">Copy {d}'s hours to:</div>
                        <div className="row wrap gap-6">
                          {DAY_CODES.filter((o) => o !== d).map((o) => {
                            const checked = copyTargets.has(o);
                            return (
                              <button
                                key={o}
                                type="button"
                                className={`chip ${checked ? "active" : ""}`}
                                style={{ fontSize: 12 }}
                                onClick={() => {
                                  const next = new Set(copyTargets);
                                  if (checked) next.delete(o); else next.add(o);
                                  setCopyTargets(next);
                                }}
                              >
                                {checked && <Check size={11} style={{ marginRight: 3, verticalAlign: -1 }} />}
                                {o}
                              </button>
                            );
                          })}
                        </div>
                        <div className="row gap-8">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCopyMenuDay(null)}>Cancel</button>
                          <button type="button" className="btn btn-primary btn-sm" disabled={copyTargets.size === 0} onClick={applyCopy}>Apply</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Slot duration & max appointments */}
      <div className="row gap-12">
        <div className="field grow">
          <label className="tiny semi muted">Appointment Slot Duration</label>
          <select
            className="input"
            value={w.slotDurationMin}
            onChange={(e) => commit({ ...w, slotDurationMin: Number(e.target.value) })}
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
          <div className="input" style={{ fontSize: 13.5, padding: "10px 12px", background: "var(--ink-50)", fontWeight: 700, display: "flex", alignItems: "center", height: 38 }}>
            {maxSlotsLabel}
          </div>
        </div>
      </div>

      {/* Public profile display preview */}
      <div className="card card-condensed" style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
        <div className="tiny semi muted">Public Profile Display Preview:</div>
        <div className="bold small" style={{ color: "var(--brand-800)", marginTop: 2 }}>
          <Clock size={12} style={{ marginRight: 4, verticalAlign: -1 }} />{previewText}
        </div>
      </div>
    </div>
  );
}

/** Shared range-list editor used by "Same every day" mode (edits Monday's ranges, mirrored to all days). */
function RangesEditor({
  ranges, onUpdate, onRemove, onAdd,
}: {
  ranges: { from: string; to: string }[];
  onUpdate: (i: number, patch: Partial<{ from: string; to: string }>) => void;
  onRemove: (i: number) => void;
  onAdd: (next: { from: string; to: string }[]) => void;
}) {
  return (
    <div className="col gap-8">
      {ranges.map((r, i) => (
        <div key={i} className="row gap-8 center-v">
          <input className="input" style={{ width: 90, padding: "8px 8px", textAlign: "center" }} type="time" value={r.from} onChange={(e) => onUpdate(i, { from: e.target.value })} />
          <span className="muted">–</span>
          <input className="input" style={{ width: 90, padding: "8px 8px", textAlign: "center" }} type="time" value={r.to} onChange={(e) => onUpdate(i, { to: e.target.value })} />
          {ranges.length > 1 && (
            <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => onRemove(i)}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {ranges.length < 2 && (
        <button
          type="button"
          className="tiny semi"
          style={{ color: "var(--brand-600)", textAlign: "left" }}
          onClick={() => {
            const lastTo = ranges[ranges.length - 1]?.to ?? "09:00";
            onAdd([...ranges, { from: lastTo, to: "19:00" }]);
          }}
        >
          <Plus size={12} style={{ marginRight: 3, verticalAlign: -1 }} /> Add second shift
        </button>
      )}
    </div>
  );
}
