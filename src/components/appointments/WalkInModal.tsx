import { useEffect, useState } from "react";
import { UserPlus, X } from "@/components/Icons";

export interface WalkInPackageOption {
  id: string;
  name: string;
  price: number;
  duration?: string;
  /** Bookings this service can take at the same time. Undefined/null → falls
   *  back to the business default resolved by the caller. */
  slotCapacity?: number | null;
  /** Max spots one booking may take for this service. */
  maxPartySize?: number;
}

interface WalkInModalProps {
  date: Date;
  timeLabel: string;
  packages: WalkInPackageOption[];
  /** The business's fallback capacity for a walk-in with no package selected
   *  (or whose package has no capacity of its own). 1 reproduces the classic
   *  one-at-a-time rule. */
  defaultCapacity?: number;
  onConfirm: (opts: { name: string; phone: string; packageId?: string; packageName?: string; packagePrice?: number; partySize?: number }) => void;
  onClose: () => void;
  submitting?: boolean;
}

export default function WalkInModal({ date, timeLabel, packages, defaultCapacity = 1, onConfirm, onClose, submitting }: WalkInModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(1);
  const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const selectedPkg = packages.find((p) => p.id === pkgId);

  // Mirrors the server's resolve_slot_capacity: package capacity, else the
  // business default. Without a package selected, max party = the business
  // default itself (no per-service max_party_size applies — same as the
  // trigger, which only checks max_party_size when a package_id is present).
  const capacity = Math.max(1, selectedPkg?.slotCapacity ?? defaultCapacity ?? 1);
  const maxParty = selectedPkg ? Math.min(capacity, Math.max(1, selectedPkg.maxPartySize ?? 1)) : capacity;
  const canPickParty = maxParty > 1;

  useEffect(() => {
    setPartySize((n) => Math.max(1, Math.min(n, maxParty)));
  }, [maxParty]);

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

        {/* Party size — only when this slot can actually hold more than one
            booking, so a normal 1:1 walk-in shows nothing extra. */}
        {canPickParty && (
          <div>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Party size</label>
            <div className="row gap-12 center-v">
              <div className="row center-v" style={{ border: "1px solid var(--ink-200)", borderRadius: 10, overflow: "hidden" }}>
                <button
                  type="button"
                  aria-label="Fewer"
                  disabled={partySize <= 1}
                  onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                  style={{ width: 36, height: 34, fontSize: 18, fontWeight: 600, color: partySize <= 1 ? "var(--ink-300)" : "var(--ink-700)" }}
                >
                  −
                </button>
                <span className="semi" style={{ minWidth: 28, textAlign: "center", fontSize: 14 }}>{partySize}</span>
                <button
                  type="button"
                  aria-label="More"
                  disabled={partySize >= maxParty}
                  onClick={() => setPartySize((n) => Math.min(maxParty, n + 1))}
                  style={{ width: 36, height: 34, fontSize: 18, fontWeight: 600, color: partySize >= maxParty ? "var(--ink-300)" : "var(--ink-700)" }}
                >
                  +
                </button>
              </div>
              <div className="tiny muted">Up to {maxParty} at this time</div>
            </div>
          </div>
        )}

        <div className="row gap-8 end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-green btn-sm"
            disabled={submitting || name.trim().length < 2}
            onClick={() => onConfirm({
              name: name.trim(), phone: phone.trim(),
              packageId: selectedPkg?.id, packageName: selectedPkg?.name, packagePrice: selectedPkg?.price,
              partySize: canPickParty ? partySize : undefined,
            })}
          >
            <UserPlus size={13} /> {submitting ? "Adding…" : "Add booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
