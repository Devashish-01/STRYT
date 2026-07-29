import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Zap, Clock } from "@/components/Icons";
import { providerService } from "@/services";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import LivePulseDot from "@/components/LivePulseDot";
import ProviderManageNav from "./ProviderManageNav";
import WeeklyHoursEditor from "@/components/WeeklyHoursEditor";
import { evaluateProviderAvailability, calculateNextTurnoffTime } from "@/utils/availability";

export default function ProviderAvailability() {
  const { id = "" } = useParams();
  const { showToast } = useApp();
  const { data: provider, loading: providerLoading } = useQuery(() => providerService.get(id), [id], `provider:${id}`);

  // Keep all form state as null until real data arrives — prevents default-value flash
  const [now, setNow] = useState<boolean | null>(null);
  const [hours, setHours] = useState(3);
  const [noteRaw, setNoteRaw] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // Populate state exactly once when provider data arrives
  useEffect(() => {
    if (!provider) return;
    setNow(provider.isAvailableNow ?? false);
    setNoteRaw(provider.availabilityNote ?? "");
  }, [provider]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Availability" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  // Effective values — fall back to defaults only for computed display (never shown before data loads)
  const effectiveNow = now ?? false;

  const evalResult = evaluateProviderAvailability(provider?.availabilityNote, effectiveNow, provider?.availableUntil);

  // Don't render the form at all until real data is ready — no flash of defaults
  const formReady = !providerLoading && now !== null && noteRaw !== undefined;

  async function toggleNow() {
    const prev = now;
    const next = !now;
    setNow(next);
    try {
      if (next && !evalResult.isOpenNow) {
        // Turning ON during off-hours: set availableUntil to next day's turnoff time!
        const turnoff = calculateNextTurnoffTime(noteRaw);
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
    if (noteRaw === undefined) return;
    setSaving(true);
    try {
      await providerService.update(id, { availabilityNote: noteRaw });
      showToast("Saved availability");
    } catch {
      showToast("Couldn't update availability note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Hours & Availability" />
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

              {noteRaw !== undefined && (
                <WeeklyHoursEditor key={id} initialRaw={noteRaw} onChange={setNoteRaw} />
              )}

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
