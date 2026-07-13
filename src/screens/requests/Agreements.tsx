import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, inr, EmptyState, SafeImg } from "@/components/common";
import { NoDealsIllustration } from "@/components/illustrations";
import { requestService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { ChevronRight } from "@/components/Icons";
import { useApp } from "@/store";
import type { AgreementStatus } from "@/types";

const statusMeta: Record<AgreementStatus, { label: string; tone: string }> = {
  PENDING:      { label: "Awaiting confirmation", tone: "amber" },
  ACTIVE:       { label: "Active",                tone: "blue" },
  DEPOSIT_PAID: { label: "Deposit paid",          tone: "blue" },
  IN_PROGRESS:  { label: "In progress",           tone: "blue" },
  REVIEW:       { label: "Under review",          tone: "amber" },
  COMPLETED:    { label: "Completed",             tone: "green" },
  CANCELLED:    { label: "Cancelled",             tone: "gray" },
  DISPUTED:     { label: "Disputed",              tone: "red" },
};

export default function Agreements() {
  const nav = useNavigate();
  const { user } = useApp();
  const [tab, setTab] = useState<"active" | "completed">("active");
  // Realtime: a deal's status changes when the other party confirms / starts /
  // completes — the list should reflect that live, like the single-deal screen.
  const { data, loading, error, refetch } = useQueryWithRealtime(() => requestService.agreements(), "agreements", []);

  const agreements = data ?? [];
  const TERMINAL: AgreementStatus[] = ["COMPLETED", "CANCELLED", "DISPUTED"];
  const active = agreements.filter((a) => !TERMINAL.includes(a.status));
  const completed = agreements.filter((a) => TERMINAL.includes(a.status));
  const list = tab === "active" ? active : completed;

  return (
    <div className="screen screen-boxed">
      <AppBar title="My agreements" />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
        {([["active", `Active (${active.length})`], ["completed", `History (${completed.length})`]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="semi"
            style={{ flex: 1, padding: "12px 0", fontSize: 14, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-12">
        {loading ? (
          <ListSkeleton count={3} type="appointment" />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : list.length === 0 ? (
          <EmptyState illustration={<NoDealsIllustration />} emoji="🤝" title="No agreements here" text="Accepted proposals turn into agreements you can track here." />
        ) : (
          list.map((a) => {
            const M = statusMeta[a.status];
            // Show the OTHER party, not the viewer's own name/avatar — a
            // business/provider viewing their own accepted proposal here was
            // previously shown "with {themselves}" since the card always
            // rendered the responder side regardless of perspective.
            const isRequester = a.requesterUserId === user.id;
            const otherName = isRequester ? a.responderName : a.requesterName;
            const otherAvatar = isRequester ? a.responderAvatar : a.requesterAvatar;
            return (
              <button key={a.id} className="card" style={{ textAlign: "left" }} onClick={() => nav(`/agreement/${a.id}`)}>
                <div className="row between">
                  <span className={`badge badge-${M.tone}`}>{M.label}</span>
                  <span className="tiny muted">{a.scheduledFor}</span>
                </div>
                <div className="row gap-10" style={{ marginTop: 10 }}>
                  <SafeImg src={otherAvatar} variant="avatar" className="avatar" style={{ width: 44, height: 44 }} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="semi small ellipsis">{a.requestTitle}</div>
                    <div className="tiny muted">with {otherName}</div>
                  </div>
                  <div className="col" style={{ alignItems: "flex-end" }}>
                    <span className="bold tabular-nums" style={{ color: "var(--green-500)" }}>{inr(a.agreedPrice)}</span>
                    <ChevronRight size={18} color="var(--ink-300)" />
                  </div>
                </div>
                {a.status === "COMPLETED" && (
                  <button
                    className="btn btn-ghost btn-sm btn-block"
                    style={{ marginTop: 10 }}
                    onClick={(e) => { e.stopPropagation(); nav(`/rate/${a.id}`); }}
                  >
                    Rate {otherName}
                  </button>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
