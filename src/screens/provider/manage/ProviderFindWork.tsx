import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, EmptyState, inr } from "@/components/common";
import { requestService, providerService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard } from "@/components/cards";
import { PROPOSAL_STATUS_BADGE } from "@/lib/statusBadges";
import type { RequestPost } from "@/types";
import ProviderManageNav from "./ProviderManageNav";
import { Plus, Copy, Trash2, FileText } from "@/components/Icons";
import { useApp } from "@/store";
import { haptics } from "@/lib/haptics";
import { copyText } from "@/lib/clipboard";
import { loadQuoteTemplates, addQuoteTemplate, deleteQuoteTemplate, type QuoteTemplate } from "@/lib/quoteTemplates";

type Tab = "requests" | "sent" | "templates";

// Prospecting home — matching open requests + your sent proposals + reusable
// quote templates so a proposal is a pick, not a retype (see PROVIDER_DESIGN.md).
export default function ProviderFindWork() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const [tab, setTab] = useState<Tab>("requests");
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const { data: p } = useQuery(() => providerService.get(id), [id], `provider:${id}`);
  const { data: sentProposals, loading: sentLoading, refetch: refetchSent } = useQuery(
    () => requestService.myProposals(id),
    [id]
  );

  async function withdraw(proposalId: string) {
    setWithdrawing(proposalId);
    haptics.medium();
    try {
      await requestService.withdrawProposal(proposalId);
      haptics.success();
      showToast("Proposal withdrawn");
      refetchSent();
    } catch (e: any) {
      showToast(e?.message || "Couldn't withdraw — try again");
    } finally {
      setWithdrawing(null);
    }
  }
  const { data, loading, error, refetch } = useQueryWithRealtime(
    () => requestService.feed({
      lat: p?.lat ?? undefined,
      lng: p?.lng ?? undefined,
      radiusKm: p?.serviceRadiusKm ?? undefined,
    }),
    "requests",
    [p?.lat, p?.lng, p?.serviceRadiusKm]
  );

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Find work" />
        <EmptyState emoji="⚠️" title="Missing provider" text="No provider id in the URL." />
      </div>
    );
  }

  // Category-matched open requests only — a request surfaces to the providers
  // it's actually for (falls through when the request carries no category).
  const items = ((data?.data ?? []) as RequestPost[])
    .filter((r) => r.status === "OPEN")
    .filter((r) => !r.categoryId || !p?.categoryId || r.categoryId === p.categoryId);

  return (
    <div className="screen with-nav">
      <AppBar title="Find work" subtitle="Win new jobs near you" />

      <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 6 }}>
        <button className={`chip ${tab === "requests" ? "active" : ""}`} onClick={() => setTab("requests")}>
          🙋 Open Requests ({items.length})
        </button>
        <button className={`chip ${tab === "sent" ? "active" : ""}`} onClick={() => setTab("sent")}>
          📨 Sent ({sentProposals?.length ?? 0})
        </button>
        <button className={`chip ${tab === "templates" ? "active" : ""}`} onClick={() => setTab("templates")}>
          ⚡ Quote templates
        </button>
      </div>

      <div className="screen-scroll">
        {tab === "requests" && (
          <>
            <div className="page-pad" style={{ paddingBottom: 0 }}>
              <div className="card row gap-10" style={{ padding: 12, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
                <span style={{ fontSize: 20 }}>🙋</span>
                <span className="tiny" style={{ color: "var(--green-600)", lineHeight: 1.4 }}>
                  Open requests near you. Send a proposal to win the job — itemize your quote for the best shot.
                </span>
              </div>
            </div>
            {loading && <ListSkeleton count={3} />}
            {error && <ErrorView error={error} onRetry={refetch} />}
            {data && (
              <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
                {items.length === 0 ? <EmptyState emoji="🌙" title="No open requests" text="New matching requests will appear here." /> : items.map((r) => <RequestCard key={r.id} r={r} />)}
              </div>
            )}
          </>
        )}

        {tab === "sent" && (
          <div className="page-pad col gap-10" style={{ paddingTop: 12 }}>
            {sentLoading ? (
              <ListSkeleton count={3} />
            ) : (sentProposals ?? []).length === 0 ? (
              <EmptyState emoji="📨" title="No proposals sent yet" text="Proposals you send as this provider appear here." />
            ) : (
              (sentProposals ?? []).map((sp) => (
                <button key={sp.id} className="card" style={{ textAlign: "left" }} onClick={() => nav(`/request/${sp.requestId}`)}>
                  <div className="row between">
                    <span className={`badge ${PROPOSAL_STATUS_BADGE[sp.status].cls}`}>{PROPOSAL_STATUS_BADGE[sp.status].label}</span>
                    <span className="tiny muted">{sp.postedAt}</span>
                  </div>
                  <div className="semi small ellipsis" style={{ marginTop: 6 }}>{sp.requestTitle}</div>
                  <div className="row between" style={{ marginTop: 2 }}>
                    <div className="tiny muted">Your quote: {inr(sp.price)}</div>
                    {sp.status === "SUBMITTED" && (
                      <button
                        className="tiny semi"
                        style={{ color: "var(--red-600)" }}
                        disabled={withdrawing === sp.id}
                        onClick={(e) => { e.stopPropagation(); withdraw(sp.id); }}
                      >
                        {withdrawing === sp.id ? "Withdrawing…" : "Withdraw"}
                      </button>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "templates" && <QuoteTemplatesManager providerId={id} showToast={showToast} />}

        <div style={{ height: 16 }} />
      </div>

      <ProviderManageNav pid={id} />
    </div>
  );
}

function QuoteTemplatesManager({ providerId, showToast }: { providerId: string; showToast: (m: string) => void }) {
  const [list, setList] = useState<QuoteTemplate[]>(() => loadQuoteTemplates(providerId));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [price, setPrice] = useState("");
  const [adding, setAdding] = useState(false);

  function add() {
    if (!title.trim() || !body.trim()) return;
    const next = addQuoteTemplate(providerId, {
      title: title.trim(),
      body: body.trim(),
      price: price ? Number(price) : undefined,
    });
    setList(next);
    setTitle("");
    setBody("");
    setPrice("");
    setAdding(false);
    showToast("Template saved");
  }

  function remove(templateId: string) {
    setList(deleteQuoteTemplate(providerId, templateId));
    showToast("Template removed");
  }

  function copy(t: QuoteTemplate) {
    const text = t.price ? `${t.body}\n\nQuote: ${inr(t.price)}` : t.body;
    copyText(text).then((ok) => showToast(ok ? "Copied — paste into your proposal" : "Couldn't copy"));
  }

  return (
    <div className="page-pad col gap-12" style={{ paddingTop: 12 }}>
      <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
        <FileText size={18} color="var(--brand-700)" style={{ flexShrink: 0 }} />
        <span className="tiny" style={{ color: "var(--brand-800)", lineHeight: 1.4 }}>
          Save your common quotes here, then copy one into a proposal instead of retyping it every time.
        </span>
      </div>

      {!adding ? (
        <button className="btn btn-outline btn-block row center gap-6" onClick={() => setAdding(true)}>
          <Plus size={16} /> New template
        </button>
      ) : (
        <div className="card col gap-10" style={{ padding: 14 }}>
          <div className="field">
            <label className="tiny semi muted">Title</label>
            <input className="input" placeholder="e.g. Standard AC service" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label className="tiny semi muted">Message</label>
            <textarea className="input" rows={3} placeholder="e.g. Includes full servicing, gas top-up check and a 15-day warranty." value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="field">
            <label className="tiny semi muted">Quote (₹, optional)</label>
            <input className="input" inputMode="numeric" placeholder="e.g. 499" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="row gap-8 end">
            <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setTitle(""); setBody(""); setPrice(""); }}>Cancel</button>
            <button className="btn btn-green btn-sm" disabled={!title.trim() || !body.trim()} onClick={add}>Save template</button>
          </div>
        </div>
      )}

      {list.length === 0 && !adding ? (
        <EmptyState emoji="⚡" title="No templates yet" text="Add a reusable quote to send proposals faster." />
      ) : (
        list.map((t) => (
          <div key={t.id} className="card col gap-8" style={{ padding: 14 }}>
            <div className="row between center-v">
              <span className="semi small">{t.title}</span>
              {t.price != null && <span className="badge badge-green" style={{ fontSize: 10 }}>{inr(t.price)}</span>}
            </div>
            <p className="tiny muted" style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{t.body}</p>
            <div className="row gap-8" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <button className="btn btn-outline btn-sm grow row center gap-4" onClick={() => copy(t)}>
                <Copy size={13} /> Copy
              </button>
              <button className="btn btn-outline btn-sm row center gap-4" style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }} onClick={() => remove(t.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
