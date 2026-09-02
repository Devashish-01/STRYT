import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, inr, EmptyState } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Plus, QrCode, Trash2, CheckCircle2, X, Edit3 } from "@/components/Icons";
import { bulkService, businessService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import QrScannerSheet from "@/components/QrScannerSheet";
import ManageNav from "./ManageNav";
import type { BulkDeal, GroupBuyToken } from "@/types";

/** Business console: create/edit wholesale offers, and validate group-buy
 *  claim passes at handover. */
export default function BulkDealsManager() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const { data: biz } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const { data: deals, loading, refetch } = useQuery(
    () => bulkService.dealsForBusiness(id),
    [id],
    `bulk:biz-deals:${id}`
  );

  const [editingDeal, setEditingDeal] = useState<BulkDeal | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [lastRedeemed, setLastRedeemed] = useState<GroupBuyToken | null>(null);

  async function redeem(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setRedeeming(true);
    try {
      const token = await bulkService.redeemToken(trimmed);
      setLastRedeemed(token);
      setManualCode("");
      setScanning(false);
      showToast(`✓ Pass accepted — ${token.quantity} unit${token.quantity > 1 ? "s" : ""}`);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      // The server distinguishes these deliberately; surface the difference so
      // staff know whether to hand goods over or turn someone away.
      if (/ALREADY_REDEEMED/.test(msg)) showToast("Already used — this pass was claimed before");
      else if (/TOKEN_EXPIRED/.test(msg)) showToast("This pass has expired");
      else if (/TOKEN_NOT_FOUND/.test(msg)) showToast("Unrecognised code");
      else if (/NOT_AUTHORIZED/.test(msg)) showToast("This pass isn't for your business");
      else showToast(msg || "Couldn't validate — try again");
    } finally {
      setRedeeming(false);
    }
  }

  if (!id) {
    return <div className="screen"><AppBar title="Bulk deals" /></div>;
  }

  return (
    <div className="screen with-nav">
      <AppBar title="Bulk deals" subtitle={biz?.name ? `For ${biz.name}` : "Wholesale offers & claim passes"} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>

        {/* Claim pass validator */}
        <div className="card col gap-10" style={{ padding: 14 }}>
          <div className="row between center-v">
            <div className="semi small">Validate a claim pass</div>
            <button className="btn btn-outline btn-sm row gap-6" onClick={() => setScanning(true)}>
              <QrCode size={14} /> Scan
            </button>
          </div>
          <div className="row gap-8">
            <input
              className="input grow"
              placeholder="STRYT-XXXX-XXXX"
              value={manualCode}
              style={{ fontFamily: "monospace", textTransform: "uppercase" }}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void redeem(manualCode); }}
            />
            <button className="btn btn-primary btn-sm" disabled={redeeming || !manualCode.trim()} onClick={() => redeem(manualCode)}>
              {redeeming ? "…" : "Accept"}
            </button>
          </div>
          {lastRedeemed && (
            <div className="card row gap-10 center-v" style={{ padding: 10, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
              <CheckCircle2 size={18} color="var(--green-600)" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div className="tiny semi" style={{ color: "var(--green-600)" }}>
                  {lastRedeemed.tokenCode} accepted
                </div>
                <div className="tiny muted ellipsis">
                  {lastRedeemed.itemLabel} · {lastRedeemed.quantity} unit{lastRedeemed.quantity > 1 ? "s" : ""}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Deals */}
        <div>
          <div className="row between center-v" style={{ marginBottom: 8 }}>
            <div className="small semi muted">Your campaigns</div>
            <button
              className="btn btn-primary btn-sm row gap-6"
              onClick={() => nav("/community/new", { state: { businessId: id, businessName: biz?.name, businessAvatar: biz?.coverImage, bulkBuying: true } })}
            >
              <Plus size={14} /> New campaign
            </button>
          </div>

          {loading && <ListSkeleton count={2} />}

          {!loading && (deals ?? []).length === 0 && (
            <EmptyState emoji="📦" title="No campaigns yet" text="Post a bulk-buying campaign — customers pledge a quantity and you fulfil once it's full." />
          )}

          <div className="col gap-10">
            {(deals ?? []).map((d) => (
              <DealRow key={d.id} deal={d} businessId={id} onChanged={refetch} onEdit={() => setEditingDeal(d)} />
            ))}
          </div>
        </div>
      </div>

      {editingDeal && (
        <DealComposer
          existing={editingDeal}
          onSaved={() => { setEditingDeal(null); refetch(); }}
          onClose={() => setEditingDeal(null)}
        />
      )}
      {scanning && (
        <QrScannerSheet
          title="Scan claim pass"
          onScan={(code) => void redeem(code)}
          onClose={() => setScanning(false)}
        />
      )}
      <ManageNav bizId={id} />
    </div>
  );
}

function DealRow({ deal, businessId, onChanged, onEdit }: { deal: BulkDeal; businessId: string; onChanged: () => void; onEdit: () => void }) {
  const nav = useNavigate();
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await bulkService.deleteDeal(deal.id);
      showToast("Deal removed");
      onChanged();
    } catch (e: any) {
      showToast(e?.message || "Couldn't remove");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = deal.closedAtISO
    ? deal.closeOutcome === "FULFILLED" ? "Fulfilled" : deal.closeOutcome === "REFUNDED" ? "Refunded" : "Needs a decision"
    : `${deal.pledgedQuantity ?? 0} of ${deal.moq} pledged`;
  const statusColor = deal.closedAtISO
    ? deal.closeOutcome === "FULFILLED" ? "var(--green-600)" : deal.closeOutcome === "REFUNDED" ? "var(--ink-500)" : "var(--amber-700)"
    : "var(--brand-700)";

  return (
    <div className="card col gap-8" style={{ padding: 12 }}>
      <div className="row between center-v">
        <button
          className="row between center-v grow"
          style={{ background: "none", border: "none", padding: 0, textAlign: "left", minWidth: 0 }}
          onClick={() => nav(`/business/${businessId}/manage/bulk-deals/${deal.id}`)}
        >
          <div style={{ minWidth: 0 }}>
            <div className="semi small ellipsis">{deal.title}</div>
            <div className="tiny muted">Min {deal.moq} · {inr(deal.regularPrice)} regular{deal.availableQuota != null ? ` · ${deal.availableQuota} left` : ""}</div>
            <div className="tiny semi" style={{ color: statusColor, marginTop: 2 }}>{statusLabel}</div>
          </div>
        </button>
        <div className="row gap-4" style={{ flexShrink: 0 }}>
          <button className="icon-btn" onClick={onEdit} aria-label="Edit deal">
            <Edit3 size={16} color="var(--brand-700)" />
          </button>
          <button className="icon-btn" disabled={busy} onClick={remove} aria-label="Remove deal">
            <Trash2 size={16} color="var(--red-600)" />
          </button>
        </div>
      </div>
      {deal.tiers.length > 0 && (
        <div className="row gap-6" style={{ flexWrap: "wrap" }}>
          {deal.tiers.map((t) => (
            <span key={t.minQty} className="badge badge-gray" style={{ fontSize: 10 }}>
              {t.minQty}+ → {inr(t.unitPrice)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Editing an EXISTING campaign only — deliberately narrow. Price, tiers,
 *  MOQ, deposit and deadline are the terms pledgers already joined under;
 *  changing them out from underneath a live pool would be unfair to whoever
 *  already paid a deposit. Title/description/quota carry no such promise, so
 *  those stay editable here. Creating a new campaign now goes through
 *  CommunityCompose instead (see the "New campaign" button above). */
function DealComposer({ existing, onSaved, onClose }: { existing: BulkDeal; onSaved: () => void; onClose: () => void }) {
  const { showToast } = useApp();
  const [title, setTitle] = useState(existing.title);
  const [description, setDescription] = useState(existing.description ?? "");
  const [quota, setQuota] = useState(existing.availableQuota != null ? String(existing.availableQuota) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) { showToast("Give the campaign a name"); return; }
    setBusy(true);
    try {
      await bulkService.updateDeal(existing.id, {
        title: title.trim(),
        description: description.trim() || null,
        availableQuota: quota ? parseInt(quota, 10) : null,
      });
      showToast("Campaign updated ✓");
      onSaved();
    } catch (e: any) {
      showToast(e?.message || "Couldn't save — try again");
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
          <div className="bold" style={{ fontSize: 18 }}>Edit campaign</div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="col gap-14">
          <div>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Title</label>
            <input className="input" placeholder="e.g. Alphonso Mango Farm Box" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </div>

          <div>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Description (optional)</label>
            <textarea className="input" style={{ minHeight: 60, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>

          <div>
            <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Available quota (optional)</label>
            <input className="input" inputMode="numeric" placeholder="Total units you can supply" value={quota} onChange={(e) => setQuota(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>

          <div className="tiny muted" style={{ lineHeight: 1.5 }}>
            Price, volume tiers, deposit and the closing deadline are locked once a campaign is live — open it from the list to extend the deadline instead.
          </div>

          <button className="btn btn-primary btn-block" style={{ height: 48, fontSize: 15, fontWeight: 700 }} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
