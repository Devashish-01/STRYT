import { useState } from "react";
import { UserPlus, X } from "lucide-react";

export interface WalkInPackageOption {
  id: string;
  name: string;
  price: number;
  duration?: string;
}

interface WalkInModalProps {
  date: Date;
  timeLabel: string;
  packages: WalkInPackageOption[];
  onConfirm: (opts: { name: string; phone: string; packageId?: string; packageName?: string; packagePrice?: number }) => void;
  onClose: () => void;
  submitting?: boolean;
}

export default function WalkInModal({ date, timeLabel, packages, onConfirm, onClose, submitting }: WalkInModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pkgId, setPkgId] = useState<string | null>(null);
  const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const selectedPkg = packages.find((p) => p.id === pkgId);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div className="card col gap-14" style={{ width: "100%", maxWidth: 400, padding: 20, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
        <div className="row between center-v">
          <div className="bold" style={{ fontSize: 16 }}>Add walk-in booking</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="tiny muted">{dateLabel} at {timeLabel}</div>

        <div>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Customer name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Sharma" />
        </div>
        <div>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Phone (optional)</label>
          <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))} placeholder="e.g. 98765 43210" />
        </div>

        {packages.length > 0 && (
          <div>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Package (optional)</label>
            <div className="col gap-6">
              {packages.map((pk) => {
                const on = pkgId === pk.id;
                return (
                  <button
                    key={pk.id}
                    type="button"
                    onClick={() => setPkgId(on ? null : pk.id)}
                    className="row gap-8 center-v"
                    style={{ padding: 10, borderRadius: 10, border: on ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)", background: on ? "var(--brand-50)" : "#fff" }}
                  >
                    <span className="grow tiny semi">{pk.name}</span>
                    <span className="tiny bold" style={{ color: "var(--brand-700)" }}>₹{pk.price}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="row gap-8 end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-green btn-sm"
            disabled={submitting || name.trim().length < 2}
            onClick={() => onConfirm({ name: name.trim(), phone: phone.trim(), packageId: selectedPkg?.id, packageName: selectedPkg?.name, packagePrice: selectedPkg?.price })}
          >
            <UserPlus size={13} /> {submitting ? "Adding…" : "Add booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
