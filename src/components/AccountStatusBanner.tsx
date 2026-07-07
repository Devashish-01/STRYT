import { useState } from "react";
import { AlertTriangle, X } from "@/components/Icons";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { appealService, type AppealEntityType } from "@/services/core/appealService";

interface AccountStatusBannerProps {
  entityType: AppealEntityType;
  entityId: string;
  /** Only SUSPENDED renders anything — pass the raw status straight through. */
  status?: string;
}

/** Shown at the top of the business/provider manage dashboard when the account is
 *  suspended — explains why, and lets the owner raise a review request that lands
 *  in the admin console (AdminAppeals), instead of leaving them with no recourse. */
export function AccountStatusBanner({ entityType, entityId, status }: AccountStatusBannerProps) {
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: appeals, refetch } = useQuery(
    () => (status === "SUSPENDED" ? appealService.mine(entityType, entityId) : Promise.resolve([])),
    [entityType, entityId, status]
  );
  const pending = (appeals ?? []).find((a) => a.status === "PENDING");

  if (status !== "SUSPENDED") return null;

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
