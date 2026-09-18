import { useState } from "react";
import { EmptyState } from "@/components/common";
import { adminService, type VerificationQueueItem } from "@/services/core/adminService";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { Check, X, Store, Briefcase, AlertTriangle, Eye, ExternalLink } from "@/components/Icons";
import { useApp } from "@/store";
import { errorMessage } from "@/lib/errorMessage";

export function AdminVerificationQueue() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => adminService.verificationQueue(), [], "admin:verification-queue");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [docsById, setDocsById] = useState<Record<string, string[]>>({});
  const [loadingDocsKey, setLoadingDocsKey] = useState<string | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);

  function keyOf(item: VerificationQueueItem) {
    return `${item.targetType}:${item.targetId}`;
  }

  async function loadDocs(item: VerificationQueueItem) {
    const key = keyOf(item);
    if (docsById[key]) return;
    setLoadingDocsKey(key);
    try {
      const urls = await adminService.viewVerificationDocs(item.targetType, item.targetId);
      setDocsById((m) => ({ ...m, [key]: urls }));
    } catch (e) {
      showToast(errorMessage(e, "Couldn't load documents"));
    } finally {
      setLoadingDocsKey(null);
    }
  }

  async function decide(item: VerificationQueueItem, decision: "APPROVE" | "REJECT" | "SUSPEND") {
    const key = keyOf(item);
    const reason = (reasonById[key] ?? "").trim();
    if (decision !== "APPROVE" && !reason) {
      showToast("Add a reason before rejecting or suspending");
      return;
    }
    setActingKey(key);
    try {
      await adminService.reviewVerification(item.targetType, item.targetId, decision, reason || undefined);
      showToast(decision === "APPROVE" ? "Approved ✓" : decision === "REJECT" ? "Rejected" : "Suspended");
      refetch();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't submit decision"));
    } finally {
      setActingKey(null);
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="🛡️" title="Nothing pending" text="No businesses or providers are waiting on manual verification." />}
      {items.map((item) => {
        const key = keyOf(item);
        const docs = docsById[key];
        const busy = actingKey === key;
        return (
          <div key={key} className="card">
            <div className="row between" style={{ marginBottom: 6 }}>
              <span className="badge badge-purple">
                {item.targetType === "BUSINESS" ? <Store size={11} /> : <Briefcase size={11} />} {item.targetType}
              </span>
              <span className="tiny muted">{new Date(item.submittedAt).toLocaleDateString()}</span>
            </div>
            <div className="semi small">{item.name}</div>
            <div className="tiny muted" style={{ marginBottom: 10 }}>
              Owner: {item.ownerName} • {item.documentCount} document{item.documentCount === 1 ? "" : "s"}
            </div>

            {docs ? (
              <div className="row wrap gap-8" style={{ marginBottom: 10 }}>
                {docs.length === 0 && <span className="tiny muted">No documents found.</span>}
                {docs.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="chip">
                    <ExternalLink size={12} /> Document {i + 1}
                  </a>
                ))}
              </div>
            ) : (
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 10 }} disabled={loadingDocsKey === key} onClick={() => loadDocs(item)}>
                <Eye size={14} /> {loadingDocsKey === key ? "Loading..." : "View documents"}
              </button>
            )}

            <input
              className="input"
              placeholder="Reason (required to reject/suspend)"
              style={{ fontSize: 12.5, marginBottom: 8 }}
              value={reasonById[key] ?? ""}
              onChange={(e) => setReasonById((m) => ({ ...m, [key]: e.target.value }))}
            />
            <div className="row gap-8">
              <button className="btn btn-outline grow btn-sm" style={{ color: "var(--red-600)" }} disabled={busy} onClick={() => decide(item, "REJECT")}>
                <X size={14} /> Reject
              </button>
              <button className="btn btn-sm grow" style={{ background: "var(--red-700)", color: "#fff" }} disabled={busy} onClick={() => decide(item, "SUSPEND")}>
                <AlertTriangle size={14} /> Suspend
              </button>
              <button className="btn btn-green grow btn-sm" disabled={busy} onClick={() => decide(item, "APPROVE")}>
                <Check size={14} /> Approve
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
