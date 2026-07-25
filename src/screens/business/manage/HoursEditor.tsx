import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Plus, X, Zap, Clock } from "@/components/Icons";
import { businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { evaluateProviderAvailability, calculateNextTurnoffTime } from "@/utils/availability";
import WeeklyHoursEditor from "@/components/WeeklyHoursEditor";

export default function HoursEditor() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const { data: b } = useQuery(() => businessService.get(id), [id], `business:${id}`);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Hours" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  const [hoursRaw, setHoursRaw] = useState<string | undefined>(undefined);
  const [special, setSpecial] = useState<{ date: string; note: string }[]>([]);
  const [newSpecial, setNewSpecial] = useState("");
  const [saving, setSaving] = useState(false);
  const [openNow, setOpenNow] = useState(false);

  // Seed form state from live business once loaded.
  useEffect(() => {
    if (!b) return;
    setHoursRaw(b.hours);
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

  async function save() {
    if (hoursRaw === undefined) return;
    setSaving(true);
    try {
      await businessService.update(id, { hours: hoursRaw });
      showToast("Hours saved");
    } catch {
      showToast("Couldn't save hours. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Hours & Availability" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {/* ── Instant availability banner (presence — separate from bookable slots) ── */}
        <div className="card" style={{ background: openNow ? "var(--green-100)" : "var(--ink-50)", border: "none" }}>
          <div className="row between center-v">
            <div className="row gap-10 center-v">
              <Zap size={22} color={openNow ? "var(--green-500)" : "var(--ink-400)"} />
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

          {hoursRaw !== undefined && (
            <WeeklyHoursEditor key={id} initialRaw={hoursRaw} onChange={setHoursRaw} />
          )}
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
