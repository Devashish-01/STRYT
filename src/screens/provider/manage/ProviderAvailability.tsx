import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Zap, Clock, Calendar, CheckCircle } from "lucide-react";
import { providerService } from "@/services";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import ProviderManageNav from "./ProviderManageNav";
import { evaluateProviderAvailability, calculateNextTurnoffTime } from "@/utils/availability";

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
  const { id = "p1" } = useParams();
  const { showToast } = useApp();
  const { data: provider } = useQuery(() => providerService.get(id), [id]);

  const [now, setNow] = useState(false);
  const [hours, setHours] = useState(3);
  const [fromTime, setFromTime] = useState("09:00 AM");
  const [toTime, setToTime] = useState("07:00 PM");
  const [daysPattern, setDaysPattern] = useState("Mon–Sat");
  const [saving, setSaving] = useState(false);

  const evalResult = evaluateProviderAvailability(provider?.availabilityNote, now, provider?.availableUntil);

  useEffect(() => {
    if (!provider) return;
    setNow(provider.isAvailableNow ?? false);
    if (provider.availabilityNote) {
      const raw = provider.availabilityNote;
      if (raw.includes("from ") && raw.includes(" to ")) {
        const parts = raw.split(" from ");
        if (parts[0]) setDaysPattern(parts[0].trim());
        const times = parts[1]?.split(" to ");
        if (times?.[0]) setFromTime(times[0].trim());
        if (times?.[1]) setToTime(times[1].trim());
      }
    }
  }, [provider]);

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
    const formattedNote = `${daysPattern} from ${fromTime} to ${toTime}`;
    try {
      await providerService.update(id, { availabilityNote: formattedNote });
      showToast(`Saved availability: ${formattedNote}`);
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
        {/* Instant Availability Banner */}
        <div className="card" style={{ padding: 16, background: now ? "#e8f7ee" : "var(--ink-50)", border: "none" }}>
          <div className="row between center-v">
            <div className="row gap-10 center-v">
              <Zap size={22} color={now ? "#16a34a" : "var(--ink-400)"} />
              <div>
                <div className="semi small">Available right now</div>
                <div className="tiny muted">{now ? `Surfaced to nearby users for ${hours}h` : "Turn on when ready for immediate jobs"}</div>
              </div>
            </div>
            <button
              onClick={toggleNow}
              style={{
                width: 48,
                height: 28,
                borderRadius: 999,
                background: now ? "var(--green-500)" : "var(--ink-200)",
                position: "relative",
                border: "none",
                cursor: "pointer"
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: now ? 23 : 3,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left .2s"
                }}
              />
            </button>
          </div>
          {now && (
            <div style={{ marginTop: 12 }}>
              <div className="row between tiny semi">
                <span className="row gap-4 center-v"><Clock size={13} /> Active duration</span>
                <span style={{ color: "#16a34a" }}>{hours} hours</span>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#16a34a", marginTop: 6 }}
              />
            </div>
          )}
        </div>

        {/* Regular Working Hours (From When to When) */}
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
                  className={`chip ${daysPattern === d.value ? "active" : ""}`}
                  style={{ fontSize: 12 }}
                >
                  <Calendar size={12} style={{ marginRight: 4 }} /> {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time Range (From When to When) */}
          <div className="row gap-12" style={{ marginTop: 4 }}>
            <div className="field grow">
              <label className="tiny semi muted">Available From (Start)</label>
              <select
                className="input"
                value={fromTime}
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
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
                style={{ fontSize: 13, padding: "10px 12px" }}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary Preview */}
          <div className="card" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
            <div className="tiny semi muted">Public Profile Display Preview:</div>
            <div className="bold small" style={{ color: "var(--brand-800)", marginTop: 2 }}>
              🕒 {daysPattern} from {fromTime} to {toTime}
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
      </div>
      <ProviderManageNav pid={id} />
    </div>
  );
}
