import { EmptyState } from "@/components/common";
import { adminService } from "@/services/core/adminService";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { Check, X, Flag } from "@/components/Icons";
import { useApp } from "@/store";
import { getSupabase } from "@/lib/supabaseClient";
import { errorMessage } from "@/lib/errorMessage";

export function AdminDisputes() {
  const { showToast } = useApp();
  const { data, loading, refetch } = useQueryWithRealtime<any[]>(async () => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("agreements")
      .select("id, request_title, status, dispute_reason, created_at, requester:users!requester_user_id(name), responder:users!responder_user_id(name)")
      .eq("status", "DISPUTED")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, "agreements", [], "status=eq.DISPUTED");

  async function resolve(agreementId: string, newStatus: "COMPLETED" | "CANCELLED") {
    try {
      await adminService.resolveAgreementDispute(agreementId, newStatus);
      // No "escrow released/refunded" here: STRYT never holds the money, so resolving a dispute
      // settles the record, not a transfer. Saying otherwise told admins a payout had happened.
      showToast(newStatus === "COMPLETED"
        ? "Resolved — marked complete"
        : "Resolved — marked cancelled");
      refetch();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't resolve the dispute."));
    }
  }

  if (loading) return <div className="page-pad"><ListSkeleton count={3} /></div>;
  const items = data ?? [];

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      {items.length === 0 && <EmptyState emoji="⚖️" title="No active disputes" text="All disputes have been resolved." />}
      {items.map((ag: any) => (
        <div key={ag.id} className="card" style={{ border: "1px solid var(--red-100)" }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="badge" style={{ background: "var(--red-100)", color: "var(--red-600)" }}>
              <Flag size={11} /> Disputed
            </span>
            <span className="tiny muted">{new Date(ag.created_at).toLocaleDateString()}</span>
          </div>
          <div className="semi small" style={{ marginBottom: 4 }}>{ag.request_title ?? "Agreement"}</div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>
            {ag.requester?.name ?? "?"} ↔ {ag.responder?.name ?? "?"}
          </div>
          {ag.dispute_reason && (
            <div className="tiny" style={{ color: "var(--orange-500)", marginBottom: 10, lineHeight: 1.4, background: "var(--red-50)", padding: "6px 8px", borderRadius: 6 }}>
              "{ag.dispute_reason}"
            </div>
          )}
          <div className="row gap-8">
            <button className="btn btn-outline grow btn-sm" style={{ color: "var(--red-600)" }}
              onClick={() => resolve(ag.id, "CANCELLED")}>
              <X size={14} /> Cancel job
            </button>
            <button className="btn btn-green grow btn-sm"
              onClick={() => resolve(ag.id, "COMPLETED")}>
              <Check size={14} /> Mark complete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
