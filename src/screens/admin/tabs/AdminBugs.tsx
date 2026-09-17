import { useState } from "react";
import { EmptyState } from "@/components/common";
import { adminService } from "@/services/core/adminService";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { useApp } from "@/store";

const BUG_ROLE_META: Record<string, { label: string; color: string }> = {
  CUSTOMER: { label: "Customer", color: "var(--brand-600)" },
  BUSINESS: { label: "Business", color: "var(--orange-500)" },
  PROVIDER: { label: "Provider", color: "var(--green-500)" },
};

export function AdminBugs() {
  const { data, loading, refetch } = useQueryWithRealtime(() => adminService.bugReports(), "bug_reports", [], undefined, "admin:bug-reports");
  const { showToast } = useApp();
  const [roleFilter, setRoleFilter] = useState<"ALL" | "CUSTOMER" | "BUSINESS" | "PROVIDER">("ALL");

  async function resolve(id: string, status: "RESOLVED" | "DISMISSED") {
    await adminService.resolveBugReport(id, status);
    showToast(status === "RESOLVED" ? "Marked resolved" : "Dismissed");
    refetch();
  }

  const items = (data ?? []).filter((b) => roleFilter === "ALL" || b.reporterRole === roleFilter);
  const counts = {
    ALL: data?.length ?? 0,
    CUSTOMER: (data ?? []).filter((b) => b.reporterRole === "CUSTOMER").length,
    BUSINESS: (data ?? []).filter((b) => b.reporterRole === "BUSINESS").length,
    PROVIDER: (data ?? []).filter((b) => b.reporterRole === "PROVIDER").length,
  };

  return (
    <div className="page-pad col gap-12">
      <div className="row gap-8" style={{ overflowX: "auto", paddingBottom: 2 }}>
        {(["ALL", "CUSTOMER", "BUSINESS", "PROVIDER"] as const).map((r) => (
          <button key={r} className={`chip ${roleFilter === r ? "active" : ""}`} onClick={() => setRoleFilter(r)}>
            {r === "ALL" ? "All" : BUG_ROLE_META[r].label} ({counts[r]})
          </button>
        ))}
      </div>

      {loading && <ListSkeleton count={3} />}
      {!loading && items.length === 0 && <EmptyState emoji="🐞" title="No bug reports" text="Nothing reported in this category yet." />}
      {items.map((b) => {
        const roleMeta = BUG_ROLE_META[b.reporterRole];
        return (
          <div key={b.id} className="card">
            <div className="row between">
              <span className="badge" style={{ background: `${roleMeta.color}1a`, color: roleMeta.color }}>{roleMeta.label}</span>
              <span className="tiny muted">{b.time}</span>
            </div>
            <p className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>{b.description}</p>
            <div className="tiny muted" style={{ marginTop: 6 }}>Reported by {b.reporterName}</div>
            {b.status === "OPEN" || b.status === "REVIEWING" ? (
              <div className="row gap-8" style={{ marginTop: 12 }}>
                <button className="btn btn-outline grow btn-sm" onClick={() => resolve(b.id, "DISMISSED")}>Dismiss</button>
                <button className="btn btn-sm grow" style={{ background: "var(--green-500)", color: "#fff" }} onClick={() => resolve(b.id, "RESOLVED")}>Mark resolved</button>
              </div>
            ) : (
              <span className={`badge ${b.status === "RESOLVED" ? "badge-green" : "badge-gray"}`} style={{ marginTop: 10 }}>
                {b.status === "RESOLVED" ? "Resolved" : "Dismissed"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
