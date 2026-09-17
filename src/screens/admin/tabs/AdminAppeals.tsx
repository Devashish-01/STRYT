import { useState } from "react";
import { EmptyState } from "@/components/common";
import { appealService, type AccountAppeal } from "@/services/core/appealService";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { Check, X, Store, Briefcase } from "@/components/Icons";
import { useApp } from "@/store";

export function AdminAppeals() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQuery(() => appealService.pending(), [], "admin:appeals-pending");
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function resolve(appeal: AccountAppeal, approve: boolean) {
    setResolvingId(appeal.id);
    try {
      await appealService.resolve(appeal, approve, noteById[appeal.id] ?? "");
      showToast(approve ? "Appeal approved — account reactivated" : "Appeal rejected");
      refetch();
    } catch (e: any) {
      showToast(e?.message || "Couldn't resolve appeal.");
    } finally {
      setResolvingId(null);
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="📮" title="No pending appeals" text="Suspended businesses/providers can raise a review request from their dashboard." />}
      {items.map((a) => (
        <div key={a.id} className="card" style={{ border: "1px solid var(--red-100)" }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="badge" style={{ background: "var(--red-100)", color: "var(--red-600)" }}>
              {a.entityType === "BUSINESS" ? <Store size={11} /> : <Briefcase size={11} />} {a.entityType}
            </span>
            <span className="tiny muted">{new Date(a.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="tiny" style={{ marginBottom: 10, lineHeight: 1.4, background: "var(--red-50)", padding: "6px 8px", borderRadius: 6, color: "var(--red-600)" }}>
            "{a.reason}"
          </div>
          <input
            className="input"
            placeholder="Admin note (optional)"
            style={{ fontSize: 12.5, marginBottom: 8 }}
            value={noteById[a.id] ?? ""}
            onChange={(e) => setNoteById((m) => ({ ...m, [a.id]: e.target.value }))}
          />
          <div className="row gap-8">
            <button
              className="btn btn-outline grow btn-sm"
              style={{ color: "var(--red-600)" }}
              disabled={resolvingId === a.id}
              onClick={() => resolve(a, false)}
            >
              <X size={14} /> Reject
            </button>
            <button
              className="btn btn-green grow btn-sm"
              disabled={resolvingId === a.id}
              onClick={() => resolve(a, true)}
            >
              <Check size={14} /> Approve & reactivate
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
