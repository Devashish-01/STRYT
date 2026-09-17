import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminService, type AdminReport } from "@/services/core/adminService";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { Flag } from "@/components/Icons";
import { useApp } from "@/store";
import { getSupabase } from "@/lib/supabaseClient";

export function AdminReports() {
  const { data, loading } = useQueryWithRealtime<AdminReport[]>(() => adminService.reports() as any, "reports", []);
  const { showToast } = useApp();
  const nav = useNavigate();
  const [resolved, setResolved] = useState<Record<string, string>>({});

  async function resolve(id: string, status: string) {
    await adminService.resolveReport(id, status);
    setResolved((r) => ({ ...r, [id]: status }));
    showToast(status === "ACTION_TAKEN" ? "Action taken" : "Dismissed");
  }

  // "Take action" used to only flip the report's own status label — the
  // reported content itself was never touched (flow-completeness audit,
  // workflow 21). Real effect per target type now: BUSINESS/PROVIDER reuse
  // the same suspend toggle AdminProfiles already has; POST hard-deletes
  // (mirroring the author's own existing delete); REQUEST soft-cancels
  // (never hard-deleted — a request can have a live agreement chained off
  // it, same reasoning as delete_business's soft-delete); COMMENT deletes
  // via admin_delete_comment (20260927), which also clears its replies and
  // reactions so nothing dangles under a comment that's gone.
  /** Where a moderator can go to read the reported thing for themselves (MOD-4). Comments and ratings have no
   *  screen of their own, so they have no link. */
  function targetLink(r: AdminReport): string | null {
    switch (r.targetType) {
      case "POST": return `/community/${r.targetId}`;
      case "REQUEST": return `/request/${r.targetId}`;
      case "BUSINESS": return `/business/${r.targetId}`;
      case "PROVIDER": return `/provider/${r.targetId}`;
      case "USER": return `/u/${r.targetId}`;
      default: return null;
    }
  }

  async function takeAction(r: AdminReport) {
    try {
      const sb = getSupabase();
      // Anything without an automatic action stays open and says so, instead of being filed as "Action taken" with
      // the reported content still live (MOD-2; what these should do is owner decision E2E-037).
      if (!["BUSINESS", "PROVIDER", "POST", "REQUEST", "COMMENT"].includes(r.targetType)) {
        showToast(`No automatic action for a reported ${r.targetType.toLowerCase()} yet — handle it directly, then dismiss.`);
        return;
      }
      if (r.targetType === "BUSINESS" || r.targetType === "PROVIDER") {
        const table = r.targetType === "BUSINESS" ? "businesses" : "providers";
        const { error } = await sb.from(table).update({ status: "SUSPENDED" }).eq("id", r.targetId);
        if (error) throw error;
      } else if (r.targetType === "POST") {
        const { error } = await (sb.rpc as any)("admin_delete_post", { p_id: r.targetId });
        if (error) throw error;
      } else if (r.targetType === "REQUEST") {
        const { error } = await (sb.rpc as any)("admin_cancel_request", { p_id: r.targetId });
        if (error) throw error;
      } else if (r.targetType === "COMMENT") {
        const { error } = await (sb.rpc as any)("admin_delete_comment", { p_id: r.targetId });
        if (error) throw error;
      }
      await resolve(r.id, "ACTION_TAKEN");
    } catch (e: any) {
      showToast(e?.message || "Couldn't take action — try again");
    }
  }

  return (
    <>
      {loading && <ListSkeleton count={3} />}
      {data && (
        <div className="page-pad col gap-12">
          {data.map((r) => {
            const status = resolved[r.id] ?? r.status;
            return (
              <div key={r.id} className="card">
                <div className="row between">
                  <span className="badge badge-red"><Flag size={11} /> {r.reason}</span>
                  <span className="tiny muted">{r.time}</span>
                </div>
                <div className="semi small" style={{ marginTop: 8 }}>{r.targetName}</div>
                <div className="tiny muted">{r.targetType} • reported by {r.reporter}</div>
                {r.details && <p className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{r.details}</p>}
                {targetLink(r) && (
                  <button
                    type="button"
                    className="tiny semi"
                    style={{ background: "none", border: "none", padding: "6px 0 0", color: "var(--brand-700)", cursor: "pointer" }}
                    onClick={() => nav(targetLink(r) as string)}
                  >
                    Open the reported {r.targetType.toLowerCase()} →
                  </button>
                )}
                {status === "OPEN" || status === "REVIEWING" ? (
                  <div className="row gap-8" style={{ marginTop: 12 }}>
                    <button className="btn btn-outline grow btn-sm" onClick={() => resolve(r.id, "DISMISSED")}>Dismiss</button>
                    <button className="btn btn-sm grow" style={{ background: "var(--red-500)", color: "#fff" }} onClick={() => takeAction(r)}>Take action</button>
                  </div>
                ) : (
                  <span className={`badge ${status === "ACTION_TAKEN" ? "badge-red" : "badge-gray"}`} style={{ marginTop: 10 }}>{status === "ACTION_TAKEN" ? "Action taken" : "Dismissed"}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

