import { useState } from "react";
import { Lock, X } from "@/components/Icons";

interface BlockSlotModalProps {
  date: Date;
  timeLabel: string | null; // null = whole day
  /** Live bookings already taken for this slot (or this day, when blocking the whole day) — blocking doesn't cancel
   *  them, so the owner is told before they block (S3). */
  affected?: { id: string; timeLabel: string; who: string }[];
  onConfirm: (opts: { recurring: boolean; reason: string }) => void;
  onClose: () => void;
  submitting?: boolean;
}

export default function BlockSlotModal({ date, timeLabel, affected = [], onConfirm, onClose, submitting }: BlockSlotModalProps) {
  const [reason, setReason] = useState("");
  const [recurring, setRecurring] = useState(false);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div className="card col gap-14" style={{ width: "100%", maxWidth: 380, padding: 20, background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="row between center-v">
          <div className="bold" style={{ fontSize: 16 }}>{timeLabel ? "Block this slot" : "Block the whole day"}</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="tiny muted">
          {timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel}{recurring ? ` — will repeat every ${weekday}` : ""}
        </div>

        {affected.length > 0 && (
          <div className="card col gap-6" style={{ padding: 12, background: "var(--amber-50)", border: "1px solid var(--amber-200)" }}>
            <div className="tiny semi" style={{ color: "var(--amber-800)" }}>
              {affected.length === 1
                ? "1 booking is already taken here"
                : `${affected.length} bookings are already taken ${timeLabel ? "here" : "on this day"}`}
            </div>
            <div className="tiny" style={{ color: "var(--amber-800)" }}>
              Blocking keeps them — it only stops new bookings. Cancel any you can't serve.
            </div>
            <div className="tiny muted">
              {affected.slice(0, 4).map((a) => `${a.timeLabel} · ${a.who}`).join("  •  ")}
              {affected.length > 4 ? `  •  +${affected.length - 4} more` : ""}
            </div>
          </div>
        )}

        <label className="row gap-8 center-v" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          <span className="tiny semi">Repeat every {weekday} (e.g. lunch break, weekly off)</span>
        </label>

        <div>
          <label htmlFor="blockslotmodal-reason-optional-customers-won-t-see-this" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Reason (optional, customers won't see this)</label>
          <textarea id="blockslotmodal-reason-optional-customers-won-t-see-this"
            className="input"
            rows={2}
            placeholder="e.g. Lunch break / staff off / personal"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ fontSize: 13, padding: 10 }}
          />
        </div>

        <div className="row gap-8 end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-sm"
            style={{ background: "var(--red-600)", color: "var(--white)" }}
            disabled={submitting}
            onClick={() => onConfirm({ recurring, reason: reason.trim() })}
          >
            <Lock size={13} /> {submitting ? "Blocking…" : "Block"}
          </button>
        </div>
      </div>
    </div>
  );
}
