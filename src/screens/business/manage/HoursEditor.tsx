import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Zap, Clock, Calendar, ChevronRight } from "@/components/Icons";
import { businessService, bustBusinessGetCache } from "@/services";
import { useQuery, invalidateQueryCache } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { evaluateProviderAvailability, calculateNextTurnoffTime } from "@/utils/availability";
import WeeklyHoursEditor from "@/components/WeeklyHoursEditor";
import Toggle from "@/components/Toggle";
import { ListSkeleton } from "@/components/states";

export default function HoursEditor() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const { data: b, loading, error, refetch: refetchBusiness } = useQuery(() => businessService.get(id), [id], `business:${id}`);

  const [hoursRaw, setHoursRaw] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [isAuto, setIsAuto] = useState(true);

  // Seed form state from live business once loaded.
  useEffect(() => {
    if (!b) return;
    setHoursRaw(b.hours);
    const auto = b.isAvailableNow == null;
    setIsAuto(auto);
    if (auto) {
      const scheduleEval = evaluateProviderAvailability(b.hours, undefined, b.availableUntil);
      setOpenNow(scheduleEval.isOpenNow);
    } else {
      setOpenNow(Boolean(b.isAvailableNow));
    }
  }, [b]);

  const isDirty = hoursRaw !== undefined && b?.hours !== undefined && hoursRaw !== b.hours;

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Hours" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  if (loading && !b) return <div className="screen"><AppBar title="Hours" /><ListSkeleton count={3} /></div>;
  if (error && !b) return <div className="screen"><AppBar title="Hours" /><ErrorView error={error} onRetry={refetchBusiness} /></div>;

  async function resumeAutoSchedule() {
    try {
      await businessService.setAvailability(id, null, null);
      showToast("Resumed automatic schedule (following weekly hours)");
      invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
      void refetchBusiness();
    } catch (e: any) {
      showToast(e?.message ?? "Couldn't resume schedule");
    }
  }

  // Presence toggle: "open right now" is separate from bookable slots — a
  // customer can still book a future working-hour slot when this is off.
  async function toggleOpenNow() {
    const prev = openNow;
    const next = !openNow;
    setOpenNow(next);
    setIsAuto(false);
    try {
      // If merchant edited hours on this screen before toggling, save them so
      // edits aren't silently discarded (HRS-4).
      if (isDirty && hoursRaw !== undefined) {
        await businessService.update(id, { hours: hoursRaw });
      }
      // Schedule-only eval — passing `next` as isAvailableNow would force "open"
      // and skip the off-hours availableUntil branch.
      const scheduleEval = evaluateProviderAvailability(hoursRaw ?? b?.hours, undefined, b?.availableUntil);
      if (next && !scheduleEval.isOpenNow) {
        // Turning ON outside working hours → auto-clear at next closing time.
        const turnoff = calculateNextTurnoffTime(hoursRaw ?? b?.hours);
        await businessService.setAvailability(id, true, turnoff.toISOString());
        showToast(`Open now — clears at ${turnoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ⚡`);
      } else {
        await businessService.setAvailability(id, next, null);
        showToast(next ? "Shop manually marked open ⚡" : "Shop manually marked closed");
      }
      invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
      void refetchBusiness();
    } catch (e: any) {
      setOpenNow(prev);
      setIsAuto(b?.isAvailableNow == null);
      showToast(e?.message ?? "Couldn't update availability");
    }
  }

  async function save() {
    if (hoursRaw === undefined) return;
    setSaving(true);
    try {
      await businessService.update(id, { hours: hoursRaw });
      // Without this, an immediate same-session toggleOpenNow() computes its
      // auto-clear time against the OLD hours — it reads b?.hours from this
      // same cached query.
      invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
      void refetchBusiness();
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
      {/* paddingBottom clears the sticky "Save Working Timing" bar below —
          ProviderAvailability.tsx (this screen's provider twin) already has
          it; this one didn't, so the last card rendered under the button. */}
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {/* ── Instant availability banner (presence — separate from bookable slots) ── */}
        <div className="card" style={{ background: openNow ? "var(--green-100)" : "var(--ink-50)", border: "none" }}>
          <div className="row between center-v">
            <div className="row gap-10 center-v">
              <Zap size={22} color={openNow ? "var(--green-500)" : "var(--ink-400)"} />
              <div>
                <div className="row gap-6 center-v">
                  <div className="semi small">Shop open right now</div>
                  {isAuto ? (
                    <span className="badge badge-purple" style={{ fontSize: 10, padding: "2px 6px" }}>Auto schedule</span>
                  ) : (
                    <span className="badge badge-amber" style={{ fontSize: 10, padding: "2px 6px" }}>Manual override</span>
                  )}
                </div>
                <div className="tiny muted">
                  {isAuto
                    ? (openNow ? "Following weekly schedule (Currently Open)" : "Following weekly schedule (Currently Closed)")
                    : (openNow ? "Manually forced open for walk-ins" : "Manually forced closed")}
                </div>
              </div>
            </div>
            <button onClick={toggleOpenNow} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} aria-label="Toggle shop open now">
              <Toggle on={openNow} />
            </button>
          </div>
          {!isAuto && (
            <div className="row between center-v" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <span className="tiny muted">Manual override is active</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{ fontSize: 11, color: "var(--brand-700)" }}
                onClick={resumeAutoSchedule}
              >
                Resume schedule (Auto)
              </button>
            </div>
          )}
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

        {/* Closing for a specific date (holidays, one-off closures) actually
            blocks bookings — unlike the old freetext "special hours" list
            here, which only ever saved a display string nobody read anywhere
            (not in slot generation, not on the public page). That real
            mechanism lives in the Appointments console. */}
        <button
          className="card row gap-12 center-v"
          style={{ width: "100%", padding: 14, textAlign: "left" }}
          onClick={() => nav(`/business/${id}/manage/appointments`)}
        >
          <Calendar size={20} color="var(--brand-700)" />
          <div className="grow">
            <div className="semi small">Block a specific date or time</div>
            <div className="tiny muted">Closing for a holiday? Block it from the Appointments console so it actually stops new bookings.</div>
          </div>
          <ChevronRight size={18} className="muted" />
        </button>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button className="btn btn-primary btn-block" disabled={saving} onClick={save}>
          {saving ? "Saving…" : isDirty ? "Save Working Timing *" : "Save Working Timing"}
        </button>
      </div>
    </div>
  );
}
