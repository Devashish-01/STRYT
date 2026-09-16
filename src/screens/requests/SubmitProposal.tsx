import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, inr, EmptyState } from "@/components/common";
import { requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton, ErrorView } from "@/components/states";
import { IndianRupee, Zap, Info, Users } from "@/components/Icons";
import { useApp } from "@/store";
import { GROUP_BUY_PROGRESS_ENABLED } from "@/utils/constants";
import { haptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import { loadQuoteTemplates } from "@/lib/quoteTemplates";

export default function SubmitProposal() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: r, loading: rLoading, error: rError, refetch: refetchR } = useQuery(() => requestService.get(id), [id], `request:${id}`);
  const { showToast, activeContext, user } = useApp();
  const { t, tf } = useI18n();
  const [price, setPrice] = useState("");
  const [eta, setEta] = useState("");
  const [message, setMessage] = useState("");
  const [boost, setBoost] = useState(false);
  const [broadcast, setBroadcast] = useState(false);
  const [sending, setSending] = useState(false);

  // Respond as whichever identity the user is currently switched to (see
  // RoleSwitcher) — a plain customer, or one of their own businesses/providers.
  // Ties the proposal to that specific entity (see requestService.submitProposal),
  // instead of every response defaulting to a generic "user".
  const respondingAs = activeContext.type !== "customer" && activeContext.id
    ? { type: activeContext.type as "business" | "provider", id: activeContext.id, name: activeContext.name }
    : null;

  const quoteTemplates = respondingAs?.type === "provider" ? loadQuoteTemplates(respondingAs.id) : [];

  const existingProposal = (r?.proposals ?? []).find((p) => {
    if (p.status !== "SUBMITTED") return false;
    if (respondingAs) {
      return p.responderType === respondingAs.type && p.responderEntityId === respondingAs.id;
    }
    return p.responderUserId === user.id && p.responderType === "user";
  });

  const canSend = Number(price) > 0 && !!eta && message.trim().length > 5 && !sending && !existingProposal;

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      await requestService.submitProposal(id, {
        price: Number(price),
        eta,
        message,
        isBoosted: boost,
        broadcastToMetoo: broadcast,
        ...(respondingAs ? { responderType: respondingAs.type, responderEntityId: respondingAs.id } : {}),
      });
      showToast(boost ? "Proposal sent & prioritized!" : "Proposal sent!");
      setTimeout(() => nav(-1), 600);
    } catch (e: any) {
      showToast(e instanceof Error && e.message ? e.message : "Couldn't send proposal. Try again.");
      setSending(false);
    }
  }

  if (rLoading) {
    return (
      <div className="screen">
        <AppBar title={t("send_proposal")} />
        <div className="page-pad col gap-12" style={{ marginTop: 16 }}>
          <Skeleton h={90} mb={0} />
          <Skeleton h={56} mb={0} />
          <Skeleton h={56} mb={0} />
        </div>
      </div>
    );
  }

  if (rError) {
    return (
      <div className="screen">
        <AppBar title={t("send_proposal")} />
        <ErrorView error={rError} onRetry={refetchR} />
      </div>
    );
  }

  if (!r) {
    return (
      <div className="screen">
        <AppBar title={t("send_proposal")} />
        <EmptyState emoji="📋" title={t("request_not_found")} text={t("request_not_found_desc")} />
      </div>
    );
  }

  if (r.status !== "OPEN") {
    return (
      <div className="screen">
        <AppBar title={t("send_proposal")} subtitle={r.title} />
        <EmptyState emoji="🔒" title="Request Closed" text="This request is no longer accepting new proposals." />
      </div>
    );
  }

  function formatBudget(min?: number, max?: number) {
    if (min && max) return `${inr(min)}–${inr(max)}`;
    if (max) return `Up to ${inr(max)}`;
    if (min) return `From ${inr(min)}`;
    return t("open_word");
  }

  return (
    <div className="screen">
      <AppBar title={t("send_proposal")} subtitle={r?.title} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: "calc(92px + env(safe-area-inset-bottom))" }}>
        {existingProposal && (
          <div className="card row gap-10" style={{ padding: "var(--space-sm)", background: "var(--amber-50)", border: "1px solid var(--amber-200)", color: "var(--amber-800)" }}>
            <Info size={16} color="var(--amber-600)" style={{ flexShrink: 0 }} />
            <span className="tiny">You already submitted an active proposal ({inr(existingProposal.price)}) for this request.</span>
          </div>
        )}

        {respondingAs && (
          <div className="card row gap-10" style={{ padding: "var(--space-sm)", background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
            <span className="tiny muted">{t("responding_as")}</span>
            <span className="semi small" style={{ color: "var(--brand-700)" }}>{respondingAs.name}</span>
          </div>
        )}
        {r && (
          <div className="card">
            <div className="row between">
              <span className="semi small">{r.title}</span>
              <span className="badge badge-purple">{r.categoryName}</span>
            </div>
            <p className="tiny muted clamp-2" style={{ marginTop: 4 }}>{r.description}</p>
            <div className="row gap-12 tiny" style={{ marginTop: 8 }}>
              <span className="muted">{t("budget_colon")} <span className="semi" style={{ color: "var(--green-500)" }}>{formatBudget(r.budgetMin, r.budgetMax)}</span></span>
              <span className="muted">{t("by_colon")} <span className="semi" style={{ color: "var(--ink-900)" }}>{r.deadline}</span></span>
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="submitproposal-your-quote-label">{t("your_quote_label")}</label>
          <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-sm)", padding: "0 12px", background: "var(--surface)" }}>
            <IndianRupee size={18} color="var(--ink-400)" />
            <input id="submitproposal-your-quote-label" className="input" style={{ border: "none", fontSize: 18, fontWeight: 700 }} inputMode="numeric" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="submitproposal-when-can-you-do-it">{t("when_can_you_do_it")}</label>
          <input id="submitproposal-when-can-you-do-it" className="input" placeholder={t("eta_placeholder")} value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>

        <div className="field">
          <label>{t("your_pitch_label")}</label>
          {quoteTemplates.length > 0 && (
            <div className="col gap-6" style={{ marginBottom: 8 }}>
              <span className="tiny muted">Quick templates:</span>
              <div className="row gap-6 wrap">
                {quoteTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="badge"
                    style={{ cursor: "pointer", background: "var(--surface-muted)", border: "1px solid var(--line)", padding: "4px 8px" }}
                    onClick={() => {
                      if (tpl.price && !price) setPrice(String(tpl.price));
                      setMessage(tpl.body);
                    }}
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <textarea className="input" placeholder={t("pitch_placeholder")} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        {/* Boost */}
        <button
          type="button"
          className="card row gap-12"
          aria-pressed={boost}
          style={{ padding: 14, border: boost ? "2px solid var(--amber-500)" : "1.5px solid var(--ink-200)", textAlign: "left" }}
          onClick={() => { haptics.selection(); setBoost((v) => !v); }}
        >
          <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: "var(--amber-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Zap size={20} color="var(--amber-500)" />
          </div>
          <div className="grow">
            <div className="semi small">{t("prioritize_offer")} <span className="tiny" style={{ color: "var(--green-600)" }}>· {t("free_word")}</span></div>
            <div className="tiny muted">{t("prioritize_offer_desc")}</div>
          </div>
          <span style={{ width: 22, height: 22, borderRadius: 6, border: boost ? "none" : "2px solid var(--ink-300)", background: boost ? "var(--amber-500)" : "transparent", color: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
            {boost ? "✓" : ""}
          </span>
        </button>

        {/* Broadcast to me-too joiners — hidden while GROUP_BUY_PROGRESS_ENABLED is off */}
        {GROUP_BUY_PROGRESS_ENABLED && r?.isGroupBuy && (r.meTooCount ?? 0) > 0 && (
          <button
            type="button"
            className="card row gap-12"
            style={{ padding: 14, border: broadcast ? "2px solid var(--brand-500)" : "1.5px solid var(--ink-200)", textAlign: "left" }}
            onClick={() => { haptics.selection(); setBroadcast((v) => !v); }}
          >
            <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: "var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={20} color="var(--brand-700)" />
            </div>
            <div className="grow">
              <div className="semi small">{tf("broadcast_to_metoo", { n: r.meTooCount ?? 0 })}</div>
              <div className="tiny muted">{t("broadcast_to_metoo_desc")}</div>
            </div>
            <span style={{ width: 22, height: 22, borderRadius: 6, border: broadcast ? "none" : "2px solid var(--ink-300)", background: broadcast ? "var(--brand-500)" : "transparent", color: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {broadcast ? "✓" : ""}
            </span>
          </button>
        )}

        <div className="row gap-8 tiny muted" style={{ lineHeight: 1.4 }}>
          <Info size={16} style={{ flexShrink: 0 }} />
          <span>{t("offline_payment_notice")}</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "12px 12px calc(12px + env(safe-area-inset-bottom))" }}>
        <button
          className="btn btn-primary btn-block"
          disabled={!canSend}
          onClick={send}
        >
          {sending ? t("sending_ellipsis") : price ? tf("send_proposal_price", { price: inr(Number(price)) }) : t("send_proposal")}
        </button>
      </div>
    </div>
  );
}
