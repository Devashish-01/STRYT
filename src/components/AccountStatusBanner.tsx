import { useState } from "react";
import { AlertTriangle, X, Clock } from "@/components/Icons";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { appealService, type AppealEntityType } from "@/services/core/appealService";
import { businessService } from "@/services";

interface AccountStatusBannerProps {
  entityType: AppealEntityType;
  entityId: string;
  /** SUSPENDED, REJECTED or (businesses only) PENDING render something — pass
   *  the raw status straight through. */
  status?: string;
  /** REJECTED only — the admin's reason, shown so the owner knows what to fix. */
  rejectionReason?: string | null;
}

/** Shown at the top of the business/provider manage dashboard when the account is
 *  suspended or rejected. SUSPENDED explains why and lets the owner raise a review
 *  request that lands in the admin console (AdminAppeals) — that's an appeal against
 *  an active suspension. REJECTED is a different mechanism: the listing was never
 *  approved in the first place, so the fix is resubmitting into the normal review
 *  queue (businessService.submitForReview), not filing an appeal — conflating the
 *  two would send a rejected owner's "fix and resubmit" into the wrong queue.
 *  Businesses only — providers go live immediately at creation with no review
 *  queue to resubmit into (see below). Previously REJECTED rendered nothing at
 *  all for either entity type: no reason, no way back. */
export function AccountStatusBanner({ entityType, entityId, status, rejectionReason }: AccountStatusBannerProps) {
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);

  const { data: appeals, refetch } = useQuery(
    () => (status === "SUSPENDED" ? appealService.mine(entityType, entityId) : Promise.resolve([])),
    [entityType, entityId, status],
    status === "SUSPENDED" ? `appeals:mine:${entityType}:${entityId}` : undefined
  );
  const pending = (appeals ?? []).find((a) => a.status === "PENDING");

  // Providers go live immediately at creation (no PENDING review queue —
  // providerService.create sets status: "ACTIVE" directly) and have no
  // submitForReview equivalent, so a REJECTED provider (only reachable via a
  // later admin action, not onboarding) has no confirmed recovery flow to
  // wire here — showing nothing for that case is no worse than before.
  // Businesses DO have a real PENDING→admin-review pipeline, so REJECTED is
  // handled below for them specifically.
  const showRejected = status === "REJECTED" && entityType === "BUSINESS";
  // #24 — a business sits at PENDING from the moment it's created until an
  // admin approves it, and during that window it is invisible in discovery.
  // The console said nothing about this, so the owner saw a working dashboard,
  // zero views, and no explanation — the commonest reading being "the app is
  // broken". Providers are excluded because they have no PENDING state at all
  // (providerService.create inserts ACTIVE).
  const showPending = status === "PENDING" && entityType === "BUSINESS";
  if (status !== "SUSPENDED" && !showRejected && !showPending) return null;

  async function submit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await appealService.submit(entityType, entityId, reason.trim());
      showToast("Review request sent to STRYT admin");
      setOpen(false);
      setReason("");
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't send review request. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resubmit() {
    setResubmitting(true);
    try {
      await businessService.submitForReview(entityId);
      showToast("Sent back for review");
    } catch (e: any) {
      showToast(e?.message || "Couldn't resubmit. Try again.");
    } finally {
      setResubmitting(false);
    }
  }

  if (showPending) {
    return (
      <div className="card row gap-10" style={{ padding: 14, margin: "0 16px 12px", background: "var(--amber-50)", border: "1px solid var(--amber-200)", alignItems: "flex-start" }}>
        <Clock size={20} color="var(--amber-700)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div className="semi small" style={{ color: "var(--amber-800)" }}>Under review</div>
          <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.4 }}>
            Your listing is with our team — usually about 24 hours. It won't show
            up in search or the feed until it's approved, but you can keep
            setting it up here in the meantime.
          </div>
        </div>
      </div>
    );
  }

  if (showRejected) {
    return (
      <div className="card col gap-10" style={{ padding: 14, margin: "0 16px 12px", background: "var(--red-50)", border: "1px solid var(--red-100)" }}>
        <div className="row gap-10" style={{ alignItems: "flex-start" }}>
          <AlertTriangle size={20} color="var(--red-600)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div className="semi small" style={{ color: "var(--red-600)" }}>This listing needs changes</div>
            <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.4 }}>
              {rejectionReason || "STRYT admin didn't approve this listing. Update it and send it back for review."}
            </div>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" disabled={resubmitting} onClick={resubmit}>
          {resubmitting ? "Sending…" : "Fix & resubmit"}
        </button>
      </div>
    );
  }

  return (
    <div className="card col gap-10" style={{ padding: 14, margin: "0 16px 12px", background: "var(--red-50)", border: "1px solid var(--red-100)" }}>
      <div className="row gap-10" style={{ alignItems: "flex-start" }}>
        <AlertTriangle size={20} color="var(--red-600)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div className="semi small" style={{ color: "var(--red-600)" }}>This account is suspended</div>
          <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.4 }}>
            You're hidden from search and the map. If you think this is a mistake, you can ask STRYT admin to take another look.
          </div>
        </div>
      </div>

      {pending ? (
        <div className="tiny semi" style={{ color: "var(--red-600)" }}>Review request sent — awaiting admin response.</div>
      ) : open ? (
        <div className="col gap-8">
          <textarea
            className="input"
            placeholder="Tell admin why this suspension should be reviewed…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ minHeight: 70 }}
          />
          <div className="row gap-8">
            <button className="btn btn-primary btn-sm grow" disabled={!reason.trim() || submitting} onClick={submit}>
              {submitting ? "Sending…" : "Send review request"}
            </button>
            <button className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
        </div>
      ) : (
        <button className="btn btn-outline btn-sm" style={{ borderColor: "var(--red-100)", color: "var(--red-600)" }} onClick={() => setOpen(true)}>
          Raise a review request
        </button>
      )}
    </div>
  );
}
