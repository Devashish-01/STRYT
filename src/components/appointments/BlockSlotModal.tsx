import { useState } from "react";
import { Lock, X } from "@/components/Icons";

interface BlockSlotModalProps {
  date: Date;
  timeLabel: string | null; // null = whole day
  onConfirm: (opts: { recurring: boolean; reason: string }) => void;
  onClose: () => void;
  submitting?: boolean;
}

export default function BlockSlotModal({ date, timeLabel, onConfirm, onClose, submitting }: BlockSlotModalProps) {
  const [reason, setReason] = useState("");
  const [recurring, setRecurring] = useState(false);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div className="card col gap-14" style={{ width: "100%", maxWidth: 380, padding: 20, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
        <div className="row between center-v">
          <div className="bold" style={{ fontSize: 16 }}>{timeLabel ? "Block this slot" : "Block the whole day"}</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="tiny muted">
          {timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel}{recurring ? ` — will repeat every ${weekday}` : ""}
        </div>

        <label className="row gap-8 center-v" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          <span className="tiny semi">Repeat every {weekday} (e.g. lunch break, weekly off)</span>
        </label>

        <div>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Reason (optional, customers won't see this)</label>
          <textarea
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
            style={{ background: "var(--red-600)", color: "#fff" }}
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
