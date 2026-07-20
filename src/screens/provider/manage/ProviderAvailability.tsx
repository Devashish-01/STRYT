import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Zap, Clock, Calendar, CheckCircle } from "@/components/Icons";
import { providerService } from "@/services";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import LivePulseDot from "@/components/LivePulseDot";
import ProviderManageNav from "./ProviderManageNav";
import { evaluateProviderAvailability, calculateNextTurnoffTime, parseTimeToMinutes, DEFAULT_DAYS_PATTERN, DEFAULT_START_TIME, DEFAULT_END_TIME } from "@/utils/availability";

const DAYS_PRESETS = [
  { label: "Mon – Sat", value: "Mon–Sat" },
  { label: "Mon – Fri", value: "Mon–Fri" },
  { label: "Everyday", value: "Everyday" },
  { label: "Weekends Only", value: "Sat–Sun" },
];

const TIME_OPTIONS = [
  "06:00 AM", "07:00 AM", "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM",
  "08:00 PM", "09:00 PM", "10:00 PM", "11:00 PM"
];

export default function ProviderAvailability() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const { data: provider, loading: providerLoading } = useQuery(() => providerService.get(id), [id], `provider:${id}`);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Availability" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  // Keep all form state as null until real data arrives — prevents default-value flash
  const [now, setNow] = useState<boolean | null>(null);
  const [hours, setHours] = useState(3);
  const [fromTime, setFromTime] = useState<string | null>(null);
  const [toTime, setToTime] = useState<string | null>(null);
  const [daysPattern, setDaysPattern] = useState<string | null>(null);
  const [slotDuration, setSlotDuration] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Populate state exactly once when provider data arrives
  useEffect(() => {
    if (!provider) return;
    setNow(provider.isAvailableNow ?? false);
    let days = DEFAULT_DAYS_PATTERN;
    let from = DEFAULT_START_TIME;
    let to   = DEFAULT_END_TIME;
    let dur  = 30;
    if (provider.availabilityNote) {
      const parts    = provider.availabilityNote.split("|");
      const mainPart = parts[0];
      const cfgPart  = parts[1];
      if (cfgPart && cfgPart.includes("duration=")) {
        const match = cfgPart.match(/duration=(\d+)/);
        if (match) dur = parseInt(match[1], 10);
      }
      if (mainPart.includes("from ") && mainPart.includes(" to ")) {
        const p = mainPart.split(" from ");
        if (p[0]) days = p[0].trim();
        const times = p[1]?.split(" to ");
        if (times?.[0]) from = times[0].trim();
        if (times?.[1]) to   = times[1].trim();
      }
    }
    setDaysPattern(days);
    setFromTime(from);
    setToTime(to);
    setSlotDuration(dur);
  }, [provider]);

  // Effective values — fall back to defaults only for computed display (never shown before data loads)
  const effectiveNow          = now ?? false;
  const effectiveFromTime     = fromTime ?? DEFAULT_START_TIME;
  const effectiveToTime       = toTime   ?? DEFAULT_END_TIME;
  const effectiveDaysPattern  = daysPattern ?? DEFAULT_DAYS_PATTERN;
  const effectiveSlotDuration = slotDuration ?? 30;

  const evalResult = evaluateProviderAvailability(provider?.availabilityNote, effectiveNow, provider?.availableUntil);

  // Don't render the form at all until real data is ready — no flash of defaults
  const formReady = !providerLoading && now !== null && fromTime !== null;

  async function toggleNow() {
    const prev = now;
    const next = !now;
    setNow(next);
    try {
      if (next && !evalResult.isOpenNow) {
        // Turning ON during off-hours: set availableUntil to next day's turnoff time!
        const turnoff = calculateNextTurnoffTime(`${daysPattern} from ${fromTime} to ${toTime}`);
        const diffHrs = Math.max(1, Math.round((turnoff.getTime() - Date.now()) / (3600 * 1000)));
        await providerService.setAvailability(id, true, diffHrs);
        showToast(`Available until ${turnoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tomorrow ⚡`);
      } else {
        await providerService.setAvailability(id, next, hours);
        showToast(next ? `Available right now ⚡` : "Marked offline");
      }
    } catch (e: any) {
      setNow(prev);
      showToast(e?.message ?? "Couldn't update availability");
    }
  }

  async function handleSaveHours() {
    setSaving(true);
    const formattedNote = `${effectiveDaysPattern} from ${effectiveFromTime} to ${effectiveToTime}|duration=${effectiveSlotDuration}`;
    try {
      await providerService.update(id, { availabilityNote: formattedNote });
      showToast(`Saved availability: ${effectiveDaysPattern} from ${effectiveFromTime} to ${effectiveToTime}`);
    } catch {
      showToast("Couldn't update availability note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Availability & Hours" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>

        {/* Show skeleton until real data is ready — prevents default-value flash */}
        {!formReady ? (
          <div className="col gap-16">
            {[120, 200, 80].map((h, i) => (
              <div key={i} style={{ height: h, borderRadius: 16, background: "var(--ink-100)", animation: "pulse-bg 1.4s ease-in-out infinite" }} />
            ))}
          </div>
        ) : (
          <>
            {/* Instant Availability Banner */}
            <div className="card" style={{ background: effectiveNow ? "var(--green-100)" : "var(--ink-50)", border: "none" }}>
              <div className="row between center-v">
                <div className="row gap-10 center-v">
                  <Zap size={22} color={effectiveNow ? "var(--green-500)" : "var(--ink-400)"} />
                  <div>
                    <div className="row gap-6" style={{ alignItems: "center" }}>
                      <span className="semi small">Available right now</span>
                      {effectiveNow && <LivePulseDot />}
                    </div>
                    <div className="tiny muted">{effectiveNow ? `Surfaced to nearby users for ${hours}h` : "Turn on when ready for immediate jobs"}</div>
                  </div>
                </div>
                <button
                  onClick={toggleNow}
                  style={{
                    width: 48,
                    height: 28,
                    borderRadius: 999,
                    background: effectiveNow ? "var(--green-500)" : "var(--ink-200)",
                    position: "relative",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 3,
                      left: effectiveNow ? 23 : 3,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left .2s"
                    }}
                  />
                </button>
              </div>
              {effectiveNow && (
                <div style={{ marginTop: 12 }}>
                  <div className="row between tiny semi">
                    <span className="row gap-4 center-v"><Clock size={13} /> Active duration</span>
                    <span style={{ color: "var(--green-500)" }}>{hours} hours</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--green-500)", marginTop: 6 }}
                  />
                </div>
              )}
            </div>

            {/* Regular Working Hours */}
            <div className="card col gap-14" style={{ padding: 16 }}>
              <div className="bold small row gap-6 center-v" style={{ color: "var(--ink-900)" }}>
                <Clock size={18} color="var(--brand-700)" /> Working Hours (Availability Timing)
              </div>

              {/* Days selector */}
              <div className="field">
                <label className="tiny semi muted">Available Days</label>
                <div className="row wrap gap-8" style={{ marginTop: 6 }}>
                  {DAYS_PRESETS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDaysPattern(d.value)}
                      className={`chip ${effectiveDaysPattern === d.value ? "active" : ""}`}
                      style={{ fontSize: 12 }}
                    >
                      <Calendar size={12} style={{ marginRight: 4 }} /> {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Range */}
              <div className="row gap-12" style={{ marginTop: 4 }}>
                <div className="field grow">
                  <label className="tiny semi muted">Available From (Start)</label>
                  <select
                    className="input"
                    value={effectiveFromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    style={{ fontSize: 13, padding: "10px 12px" }}
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field grow">
                  <label className="tiny semi muted">Available Until (End)</label>
                  <select
                    className="input"
                    value={effectiveToTime}
                    onChange={(e) => setToTime(e.target.value)}
                    style={{ fontSize: 13, padding: "10px 12px" }}
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Slot Duration & Max Appointments */}
              <div className="row gap-12" style={{ marginTop: 4 }}>
                <div className="field grow">
                  <label className="tiny semi muted">Appointment Slot Duration</label>
                  <select
                    className="input"
                    value={effectiveSlotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value))}
                    style={{ fontSize: 13, padding: "10px 12px" }}
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
                    {(() => {
                      const total = parseTimeToMinutes(effectiveToTime) - parseTimeToMinutes(effectiveFromTime);
                      return total > 0 ? Math.floor(total / effectiveSlotDuration) : 0;
                    })()} slots
                  </div>
                </div>
              </div>

              {/* Summary Preview */}
              <div className="card card-condensed" style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
                <div className="tiny semi muted">Public Profile Display Preview:</div>
                <div className="bold small" style={{ color: "var(--brand-800)", marginTop: 2 }}>
                  🕒 {effectiveDaysPattern} from {effectiveFromTime} to {effectiveToTime}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-green btn-block"
                disabled={saving}
                onClick={handleSaveHours}
                style={{ marginTop: 6 }}
              >
                {saving ? "Saving..." : "Save Working Timing"}
              </button>
            </div>
          </>
        )}
      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
