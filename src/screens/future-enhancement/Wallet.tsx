import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, inr, EmptyState, SafeImg } from "@/components/common";
import { Stamp, Ticket, Receipt, Check, Plus, Copy, Wallet as WalletIcon } from "@/components/Icons";
import { walletService } from "@/services";
import type { WalletTransaction } from "@/services/engagement/walletService";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";

type Tab = "stamps" | "coupons" | "ledger";

const SOURCE_META: Record<WalletTransaction["source"], { label: string; color: string; bg: string }> = {
  REQUEST:     { label: "Request",    color: "var(--brand-700)", bg: "var(--brand-50)" },
  APPOINTMENT: { label: "Appointment", color: "var(--blue-500)",  bg: "var(--ink-100)" },
  QUEUE:       { label: "Live queue",  color: "var(--green-600)", bg: "var(--green-100)" },
};

export default function Wallet() {
  const nav = useNavigate();
  const { extraStamps, addStamp, savedCoupons, toggleCoupon, showToast } = useApp();
  const [tab, setTab] = useState<Tab>("ledger");
  const { data, loading, error, refetch } = useQuery(() => walletService.get(), []);
  const { data: txnData } = useQuery(() => walletService.transactions(), []);

  const loyaltyCards = data?.loyaltyCards ?? [];
  const coupons = data?.coupons ?? [];
  const transactions = txnData ?? [];
  const earned = transactions.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount, 0);
  const spent = transactions.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount, 0);
  const sourceIn = (src: WalletTransaction["source"]) =>
    transactions.filter((t) => t.source === src && t.direction === "IN").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="screen">
      <AppBar title="Wallet" subtitle="Stamps, coupons & your offline ledger" />
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
        {([["stamps", "Loyalty", Stamp], ["coupons", "Coupons", Ticket], ["ledger", "Ledger", Receipt]] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className="semi row gap-6 center"
            style={{ flex: 1, padding: "12px 0", fontSize: 13.5, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-14">
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {!loading && !error && tab === "stamps" && loyaltyCards.map((c) => {
          const stamps = Math.min(c.target, c.stamps + (extraStamps[c.id] ?? 0));
          const complete = stamps >= c.target;
          return (
            <div key={c.id} className="card">
              <div className="row gap-10">
                <SafeImg src={c.businessImage} className="thumb" style={{ width: 44, height: 44, borderRadius: 10 }} />
                <div className="grow">
                  <div className="semi small">{c.businessName}</div>
                  <div className="tiny muted">{complete ? `🎉 ${c.reward} unlocked!` : `${c.target - stamps} more for ${c.reward}`}</div>
                </div>
                <span className="badge badge-purple">{stamps}/{c.target}</span>
              </div>
              <div className="row wrap gap-8" style={{ marginTop: 12 }}>
                {Array.from({ length: c.target }).map((_, i) => (
                  <div key={i} style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: i < stamps ? "var(--brand-600)" : "var(--ink-100)", color: "#fff", border: i < stamps ? "none" : "1.5px dashed var(--ink-300)" }}>
                    {i < stamps ? <Check size={15} /> : <span className="tiny muted">{i + 1}</span>}
                  </div>
                ))}
              </div>
              {complete ? (
                <button className="btn btn-green btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => showToast("Show this to the shop to redeem 🎁")}>Redeem reward</button>
              ) : (
                <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => addStamp(c.id)}>+ Add a stamp (demo)</button>
              )}
            </div>
          );
        })}

        {!loading && !error && tab === "coupons" && coupons.map((cp) => {
          const saved = savedCoupons.includes(cp.id);
          return (
            <div key={cp.id} className="card row" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ width: 8, background: "var(--accent-500)" }} />
              <div className="grow" style={{ padding: 14 }}>
                <div className="row between">
                  <span className="semi small">{cp.businessName}</span>
                  <span className="tiny muted">till {cp.validUntil}</span>
                </div>
                <div className="bold" style={{ fontSize: 17, color: "var(--orange-500)", marginTop: 4 }}>{cp.title}</div>
                <div className="row between" style={{ marginTop: 10 }}>
                  <button className="row gap-6 badge badge-amber" style={{ borderStyle: "dashed", border: "1px dashed var(--amber-500)", padding: "6px 12px" }} onClick={async () => { const ok = await copyText(cp.code); showToast(ok ? "Code copied" : "Couldn't copy code"); }}>
                    {cp.code} <Copy size={12} />
                  </button>
                  <div className="row gap-8">
                    <button className="btn btn-ghost btn-sm" onClick={() => nav(`/business/${cp.businessId}`)}>Shop</button>
                    <button className="btn btn-sm" style={{ background: saved ? "var(--ink-100)" : "var(--accent-500)", color: saved ? "var(--ink-600)" : "#fff" }} onClick={() => toggleCoupon(cp.id)}>
                      {saved ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {!loading && !error && tab === "ledger" && (
          <>
            <div className="card col center" style={{ padding: 16, gap: 4, background: "linear-gradient(135deg, var(--brand-500), var(--brand-700))", color: "#fff", border: "none" }}>
              <WalletIcon size={26} />
              <span className="tiny" style={{ opacity: 0.85 }}>Earned via STRYT</span>
              <span className="bold" style={{ fontSize: 28 }}>{inr(earned)}</span>
              {spent > 0 && <span className="tiny" style={{ opacity: 0.75 }}>{inr(spent)} paid out • settled in person</span>}
            </div>

            {/* Source breakdown — requests, appointments, live queue */}
            <div className="row gap-8">
              {(["REQUEST", "APPOINTMENT", "QUEUE"] as const).map((src) => (
                <div key={src} className="card grow col" style={{ padding: 12, gap: 2, alignItems: "flex-start" }}>
                  <span className="tiny semi" style={{ color: SOURCE_META[src].color }}>{SOURCE_META[src].label}</span>
                  <span className="bold" style={{ fontSize: 16 }}>{inr(sourceIn(src))}</span>
                </div>
              ))}
            </div>

            {transactions.length === 0 ? (
              <EmptyState emoji="🧾" title="No money activity yet" text="Paid appointments, live-queue visits, and settled requests show up here." />
            ) : (
              transactions.map((t) => (
                <div key={t.id} className="card row gap-12" style={{ padding: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: SOURCE_META[t.source].bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 18 }}>{t.source === "REQUEST" ? "🤝" : t.source === "APPOINTMENT" ? "📅" : "🎟️"}</span>
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="semi small ellipsis">{t.withName}</div>
                    <div className="tiny muted">{t.note ? `${t.note} • ` : ""}{t.date}</div>
                    <span className="badge tiny" style={{ marginTop: 4, background: SOURCE_META[t.source].bg, color: SOURCE_META[t.source].color }}>
                      {SOURCE_META[t.source].label} · {t.mode}
                    </span>
                  </div>
                  <div className="col" style={{ alignItems: "flex-end", flexShrink: 0 }}>
                    <span className="bold" style={{ color: t.direction === "IN" ? "var(--green-600)" : "var(--ink-700)" }}>
                      {t.direction === "IN" ? "+" : "−"}{inr(t.amount)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
