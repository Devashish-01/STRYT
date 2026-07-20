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
import { openProfile } from "@/lib/profileSheet";
import { AGREEMENT_STATUS_BADGE } from "@/lib/statusBadges";
import { useI18n } from "@/lib/i18n";

export default function Agreements() {
  const nav = useNavigate();
  const { user } = useApp();
  const { t, tf } = useI18n();
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
      <AppBar title={t("agreements_screen_title")} />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
        {([["active", `${t("active")} (${active.length})`], ["completed", `${t("agreements_history_tab")} (${completed.length})`]] as const).map(([tabKey, label]) => (
          <button key={tabKey} onClick={() => setTab(tabKey)} className="semi"
            style={{ flex: 1, padding: "12px 0", fontSize: 14, color: tab === tabKey ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === tabKey ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
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
          <EmptyState illustration={<NoDealsIllustration />} emoji="🤝" title={t("no_agreements_title")} text={t("no_agreements_desc")} />
        ) : (
          list.map((a) => {
            const M = AGREEMENT_STATUS_BADGE[a.status];
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
                  <span className={`badge ${M.cls}`}>{M.label}</span>
                  <span className="tiny muted">{a.scheduledFor}</span>
                </div>
                <div className="row gap-10" style={{ marginTop: 10 }}>
                  <SafeImg
                    src={otherAvatar}
                    variant="avatar"
                    className="avatar"
                    style={{ width: 44, height: 44, cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openProfile(isRequester ? a.responderUserId : a.requesterUserId, "USER", { name: otherName, avatar: otherAvatar });
                    }}
                  />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="semi small ellipsis">{a.requestTitle}</div>
                    <div className="tiny muted">{tf("with_person", { name: otherName })}</div>
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
                    {tf("rate_person", { name: otherName })}
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
