import { useState } from "react";
import { X, Minus, Plus, Users } from "@/components/Icons";
import { inr } from "@/components/common";
import { requestService } from "@/services";
import { useApp } from "@/store";
import type { RequestPost } from "@/types";
import { poolProgress } from "@/lib/groupBuy";

const MAX_PLEDGE = 50;

/** Pledge a quantity into a pool. Re-opening with an existing pledge edits it
 *  rather than adding a second one — the RPC upserts, so the pool total can't
 *  be inflated by tapping join twice. */
export default function JoinGroupBuySheet({
  req, onJoined, onClose,
}: { req: RequestPost; onJoined?: () => void; onClose: () => void }) {
  const { showToast } = useApp();
  const alreadyIn = (req.myPledgeQuantity ?? 0) > 0;
  const [qty, setQty] = useState(req.myPledgeQuantity ?? 1);
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const unitPrice = req.bulkPricePerUnit ?? null;
  // pledgedQuantity (units) is authoritative when available; meTooCount
  // (people) is the fallback — see lib/groupBuy.ts.
  const { target, pledged, hasTarget } = poolProgress({
    target: req.groupBuyTarget,
    pledgedQuantity: req.pledgedQuantity,
    meTooCount: req.meTooCount,
  });
  // Show the pool as it WOULD look after this pledge, so the contribution is
  // visible before committing rather than only after.
  const projected = pledged - (req.myPledgeQuantity ?? 0) + qty;
  const projectedPct = hasTarget ? Math.min(100, (projected / target) * 100) : 0;

  // A doorstep group buy is undeliverable without an address — the server
  // rejects it too, this just catches it before a round trip.
  const needsAddress = req.fulfillmentType === "DOORSTEP";

  async function submit() {
    if (needsAddress && !address.trim()) {
      showToast("Add a delivery address");
      return;
    }
    setBusy(true);
    try {
      await requestService.joinGroupBuy(req.id, qty, notes.trim() || null, needsAddress ? address.trim() : null);
      showToast(alreadyIn ? "Pledge updated" : `You're in — ${qty} unit${qty > 1 ? "s" : ""} pledged`);
      onJoined?.();
      onClose();
    } catch (e: any) {
      showToast(e?.message || "Couldn't join — try again");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await requestService.leaveGroupBuy(req.id);
      showToast("Left the group buy");
      onJoined?.();
      onClose();
    } catch (e: any) {
      showToast(e?.message || "Couldn't leave — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", animation: "fadeIn .2s" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px calc(20px + var(--safe-area-bottom))", maxHeight: "92vh", overflowY: "auto", animation: "slideUp .25s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between center-v" style={{ marginBottom: "var(--space-md)" }}>
          <div style={{ minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 18 }}>{alreadyIn ? "Update your pledge" : "Join group buy"}</div>
            <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>{req.title}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="col gap-6" style={{ marginBottom: "var(--space-md)" }}>
          <label className="tiny semi muted">How many do you need?</label>
          <div className="row gap-12 center-v">
            <button
              className="icon-btn"
              style={{ width: 44, height: 44, background: "var(--ink-50)" }}
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Decrease"
            ><Minus size={18} /></button>
            <div className="bold" style={{ fontSize: 30, minWidth: 56, textAlign: "center" }}>{qty}</div>
            <button
              className="icon-btn"
              style={{ width: 44, height: 44, background: "var(--ink-50)" }}
              disabled={qty >= MAX_PLEDGE}
              onClick={() => setQty((q) => Math.min(MAX_PLEDGE, q + 1))}
              aria-label="Increase"
            ><Plus size={18} /></button>
          </div>
        </div>

        {unitPrice != null && (
          <div className="card row between center-v" style={{ padding: 12, marginBottom: "var(--space-md)" }}>
            <div>
              <div className="tiny muted">Your estimated total</div>
              <div className="tiny muted" style={{ marginTop: 1 }}>at the target price of {inr(unitPrice)}/unit</div>
            </div>
            <span className="bold" style={{ color: "var(--green-600)" }}>{inr(unitPrice * qty)}</span>
          </div>
        )}

        {hasTarget && (
          <div className="card col gap-6" style={{ padding: 12, marginBottom: "var(--space-md)", background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
            <div className="row gap-8 center-v tiny semi" style={{ color: "var(--brand-700)" }}>
              <Users size={14} /> Pool would reach {projected} of {target}
            </div>
            <div style={{ height: 6, borderRadius: 6, background: "#fff", overflow: "hidden" }}>
              <div style={{ width: `${projectedPct}%`, height: "100%", background: "var(--brand-600)" }} />
            </div>
            <div className="tiny muted">
              Nothing is charged now. You'll get a claim pass once the organiser closes the deal.
            </div>
          </div>
        )}

        {needsAddress && (
          <div style={{ marginBottom: "var(--space-md)" }}>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Delivery address</label>
            <input
              className="input"
              placeholder="Flat / street / landmark"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={400}
            />
            <div className="tiny muted" style={{ marginTop: 4 }}>Shared with the chosen provider once the deal closes.</div>
          </div>
        )}

        <div style={{ marginBottom: "var(--space-md)" }}>
          <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Notes for the organiser (optional)</label>
          <input
            className="input"
            placeholder="e.g. 2 seniors, prefer morning slot"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
          />
        </div>

        <button className="btn btn-primary btn-block" style={{ height: 48, fontSize: 15, fontWeight: 700 }} disabled={busy} onClick={submit}>
          {busy ? "Saving…" : alreadyIn ? "Update pledge" : `Pledge ${qty} unit${qty > 1 ? "s" : ""}`}
        </button>

        {alreadyIn && (
          <button
            className="btn btn-block btn-sm"
            style={{ marginTop: 8, background: "none", color: "var(--red-600)" }}
            disabled={busy}
            onClick={leave}
          >
            Leave this group buy
          </button>
        )}
      </div>
    </div>
  );
}
