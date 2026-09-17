import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, inr, EmptyState } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Plus, QrCode, Trash2, CheckCircle2, X, Edit3, AlertTriangle } from "@/components/Icons";
import { bulkService, businessService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { useApp } from "@/store";
import QrScannerSheet from "@/components/QrScannerSheet";
import ManageNav from "./ManageNav";
import type { BulkDeal, GroupBuyToken } from "@/types";
import { useI18n } from "@/lib/i18n";

/** Business console: create/edit wholesale offers, and validate group-buy
 *  claim passes at handover. */
export default function BulkDealsManager() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const { t, tf } = useI18n();
  const { data: biz } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  // Realtime — a customer pledging or paying a deposit while the owner has
  // this screen open used to need a manual reload to show up, unlike the
  // directly analogous QueueManager/BusinessRequests.
  const { data: deals, loading, refetch } = useQueryWithRealtime(
    () => bulkService.dealsForBusiness(id),
    "bulk_deal_pledges",
    [id],
    undefined,
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
      const token = await bulkService.redeemToken(trimmed, id);
      setLastRedeemed(token);
      setManualCode("");
      setScanning(false);
      showToast(tf(token.quantity > 1 ? "bdm_pass_accepted_many" : "bdm_pass_accepted_one", { n: token.quantity }));
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      // The server distinguishes these deliberately; surface the difference so
      // staff know whether to hand goods over or turn someone away.
      if (/ALREADY_REDEEMED/.test(msg)) showToast(t("bdm_already_used"));
      else if (/TOKEN_EXPIRED/.test(msg)) showToast(t("bdm_expired"));
      else if (/TOKEN_NOT_FOUND/.test(msg)) showToast(t("bdm_unrecognised"));
      else if (/TOKEN_NOT_FOR_THIS_BUSINESS|NOT_AUTHORIZED/.test(msg)) showToast(t("bdm_not_your_business"));
      else showToast(msg || "Couldn't validate — try again");
    } finally {
      setRedeeming(false);
    }
  }

  if (!id) {
    return <div className="screen"><AppBar title={t("bdm_title")} /></div>;
  }

  return (
    <div className="screen with-nav">
      <AppBar title={t("bdm_title")} subtitle={biz?.name ? tf("bdm_subtitle_for", { name: biz.name }) : t("bdm_subtitle_default")} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>

        {/* Claim pass validator */}
        <div className="card col gap-10" style={{ padding: 14 }}>
          <div className="row between center-v">
            <div className="semi small">{t("bdm_validate_pass")}</div>
            <button className="btn btn-outline btn-sm row gap-6" onClick={() => setScanning(true)}>
              <QrCode size={14} /> Scan
            </button>
          </div>
          <div className="row gap-8">
            <input
              className="input grow"
              placeholder={t("bdm_code_placeholder")}
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
            <div className="card col gap-6" style={{ padding: 10, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
              <div className="row gap-10 center-v">
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
              {lastRedeemed.balanceDue != null && lastRedeemed.balanceDue > 0 && (
                <div className="row between center-v card" style={{ padding: "6px 10px", background: "var(--amber-50)", border: "1px solid var(--amber-200)", marginTop: 4 }}>
                  <span className="tiny semi" style={{ color: "var(--amber-800)" }}>{t("bdm_balance_to_collect")}</span>
                  <span className="bold small" style={{ color: "var(--amber-900)" }}>{inr(lastRedeemed.balanceDue)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Deals */}
        <div>
          <div className="row between center-v" style={{ marginBottom: 8 }}>
            <div className="small semi muted">{t("your_campaigns")}</div>
            <button
              className="btn btn-primary btn-sm row gap-6"
              onClick={() => nav("/community/new", { state: { businessId: id, businessName: biz?.name, businessAvatar: biz?.coverImage, bulkBuying: true } })}
            >
              <Plus size={14} /> New campaign
            </button>
          </div>

          {loading && <ListSkeleton count={2} />}

          {!loading && (deals ?? []).length === 0 && (
            <EmptyState emoji="📦" title={t("bdm_no_campaigns")} text={t("bdm_no_campaigns_text")} />
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
          title={t("bdm_scan_pass")}
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
  const { t, tf } = useI18n();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasPledges = (deal.pledgedQuantity ?? 0) > 0;

  async function remove() {
    setConfirmOpen(false);
    setBusy(true);
    try {
      await bulkService.deleteDeal(deal.id);
      showToast(t("bdm_deal_removed"));
      onChanged();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/CANNOT_DELETE_ACTIVE_TOKENS/.test(msg)) {
        showToast(t("bdm_cannot_delete"));
      } else {
        showToast(e?.message || "Couldn't remove");
      }
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
          <button className="icon-btn" onClick={onEdit} aria-label={t("bdm_edit_deal")}>
            <Edit3 size={16} color="var(--brand-700)" />
          </button>
          <button className="icon-btn" disabled={busy} onClick={() => setConfirmOpen(true)} aria-label={t("bdm_remove_deal")}>
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
      {/* Previously an instant, un-confirmed delete — the FK cascade wipes the
          whole pledge roster with no warning, and (until 20260913) no notice
          to anyone who'd already paid a deposit into it. */}
      {confirmOpen && (
        <div className="overlay" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="row gap-10" style={{ alignItems: "flex-start", marginBottom: 10 }}>
              <AlertTriangle size={20} color="var(--red-600)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <h3 className="bold h2" style={{ marginBottom: 4 }}>Delete "{deal.title}"?</h3>
                <p className="small muted">
                  {hasPledges
                    ? `${deal.pledgedQuantity} unit${deal.pledgedQuantity === 1 ? "" : "s"} pledged into this campaign. Anyone who already paid a deposit will be notified, but it isn't refunded automatically — sort that out with them directly. This can't be undone.`
                    : "This can't be undone."}
                </p>
              </div>
            </div>
            <button
              className="btn btn-block"
              style={{ height: 48, background: "var(--red-500)", color: "var(--surface)", fontWeight: 700 }}
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
            <button className="btn btn-block" style={{ marginTop: 8, background: "transparent" }} onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
          </div>
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
  const { t, tf } = useI18n();
  const [title, setTitle] = useState(existing.title);
  const [description, setDescription] = useState(existing.description ?? "");
  const [quota, setQuota] = useState(existing.availableQuota != null ? String(existing.availableQuota) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) { showToast(t("bdm_name_required")); return; }
    setBusy(true);
    try {
      await bulkService.updateDeal(existing.id, {
        title: title.trim(),
        description: description.trim() || null,
        availableQuota: quota ? parseInt(quota, 10) : null,
      });
      showToast(t("bdm_campaign_updated"));
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
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "var(--surface)", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px calc(20px + var(--safe-area-bottom))", maxHeight: "92vh", overflowY: "auto", animation: "slideUp .25s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between center-v" style={{ marginBottom: "var(--space-md)" }}>
          <div className="bold" style={{ fontSize: 18 }}>{t("bdm_edit_campaign")}</div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="col gap-14">
          <div>
            <label htmlFor="bulkdealsmanager-title" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("bdm_title_label")}</label>
            <input id="bulkdealsmanager-title" className="input" placeholder={t("bdm_title_placeholder")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </div>

          <div>
            <label htmlFor="bulkdealsmanager-description-optional" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("prf_description")}</label>
            <textarea id="bulkdealsmanager-description-optional" className="input" style={{ minHeight: 60, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>

          <div>
            <label htmlFor="bulkdealsmanager-available-quota-optional" className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>{t("ccp_available_quota")}</label>
            <input id="bulkdealsmanager-available-quota-optional" className="input" inputMode="numeric" placeholder={t("ccp_total_units")} value={quota} onChange={(e) => setQuota(e.target.value.replace(/[^0-9]/g, ""))} />
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
