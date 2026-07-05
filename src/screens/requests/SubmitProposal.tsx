import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, inr } from "@/components/common";
import { requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { IndianRupee, Zap, Info, Users } from "@/components/Icons";
import { useApp } from "@/store";

export default function SubmitProposal() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: r } = useQuery(() => requestService.get(id), [id]);
  const { showToast } = useApp();
  const [price, setPrice] = useState("");
  const [eta, setEta] = useState("");
  const [message, setMessage] = useState("");
  const [boost, setBoost] = useState(false);
  const [broadcast, setBroadcast] = useState(false);
  const [sending, setSending] = useState(false);

  const canSend = !!price && !!eta && message.trim().length > 5 && !sending;

  async function send() {
    setSending(true);
    try {
      await requestService.submitProposal(id, { price: Number(price), eta, message, isBoosted: boost, broadcastToMetoo: broadcast });
      showToast(boost ? "Boosted proposal sent!" : "Proposal sent!");
      setTimeout(() => nav(-1), 600);
    } catch {
      showToast("Couldn't send. Try again.");
      setSending(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Send a proposal" subtitle={r?.title} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 92 }}>
        {r && (
          <div className="card">
            <div className="row between">
              <span className="semi small">{r.title}</span>
              <span className="badge badge-purple">{r.categoryName}</span>
            </div>
            <p className="tiny muted clamp-2" style={{ marginTop: 4 }}>{r.description}</p>
            <div className="row gap-12 tiny" style={{ marginTop: 8 }}>
              <span className="muted">Budget: <span className="semi" style={{ color: "var(--green-500)" }}>{r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : "Open"}</span></span>
              <span className="muted">By: <span className="semi" style={{ color: "var(--ink-900)" }}>{r.deadline}</span></span>
            </div>
          </div>
        )}

        <div className="field">
          <label>Your quote (₹) *</label>
          <div className="row" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 12px", background: "#fff" }}>
            <IndianRupee size={18} color="var(--ink-400)" />
            <input className="input" style={{ border: "none", fontSize: 18, fontWeight: 700 }} inputMode="numeric" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>

        <div className="field">
          <label>When can you do it? *</label>
          <input className="input" placeholder="e.g. Deliver by Saturday 5 PM" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>

        <div className="field">
          <label>Your pitch *</label>
          <textarea className="input" placeholder="Tell them why you're the right fit, what's included…" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        {/* Boost */}
        <button
          type="button"
          className="card row gap-12"
          style={{ padding: 14, border: boost ? "2px solid var(--amber-500)" : "1.5px solid var(--ink-200)", textAlign: "left" }}
          onClick={() => setBoost((v) => !v)}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Zap size={20} color="var(--amber-500)" />
          </div>
          <div className="grow">
            <div className="semi small">Boost this proposal — ₹49</div>
            <div className="tiny muted">Pin to the top so the requester sees you first</div>
          </div>
          <span style={{ width: 22, height: 22, borderRadius: 6, border: boost ? "none" : "2px solid var(--ink-300)", background: boost ? "var(--amber-500)" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
            {boost ? "✓" : ""}
          </span>
        </button>

        {/* Broadcast to me-too joiners */}
        {r?.isGroupBuy && (r.meTooCount ?? 0) > 0 && (
          <button
            type="button"
            className="card row gap-12"
            style={{ padding: 14, border: broadcast ? "2px solid var(--brand-500)" : "1.5px solid var(--ink-200)", textAlign: "left" }}
            onClick={() => setBroadcast((v) => !v)}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--brand-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={20} color="var(--brand-700)" />
            </div>
            <div className="grow">
              <div className="semi small">Send this quote to everyone who said 'me too' ({r.meTooCount} people) as well as the requester</div>
              <div className="tiny muted">Only the requester can accept — this just lets more neighbors see your price.</div>
            </div>
            <span style={{ width: 22, height: 22, borderRadius: 6, border: broadcast ? "none" : "2px solid var(--ink-300)", background: broadcast ? "var(--brand-500)" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {broadcast ? "✓" : ""}
            </span>
          </button>
        )}

        <div className="row gap-8 tiny muted" style={{ lineHeight: 1.4 }}>
          <Info size={16} style={{ flexShrink: 0 }} />
          <span>Payment is settled offline for now. STRYT records the agreement; you and the requester handle the money in person.</span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button
          className="btn btn-primary btn-block"
          disabled={!canSend}
          onClick={send}
        >
          {sending ? "Sending…" : `Send proposal${price ? ` • ${inr(Number(price))}` : ""}`}
        </button>
      </div>
    </div>
  );
}
