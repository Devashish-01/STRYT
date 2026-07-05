import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, inr, EmptyState, SafeImg } from "@/components/common";
import { Stamp, Ticket, Receipt, Check, Plus, Copy, Wallet as WalletIcon } from "@/components/Icons";
import { walletService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { copyText } from "@/lib/clipboard";

type Tab = "stamps" | "coupons" | "ledger";

export default function Wallet() {
  const nav = useNavigate();
  const { extraStamps, addStamp, savedCoupons, toggleCoupon, showToast } = useApp();
  const [tab, setTab] = useState<Tab>("stamps");
  const { data, loading, error, refetch } = useQuery(() => walletService.get(), []);

  const loyaltyCards = data?.loyaltyCards ?? [];
  const coupons = data?.coupons ?? [];
  const settlements = data?.settlements ?? [];
  const totalSettled = settlements.reduce((s, x) => s + x.amount + (x.tip ?? 0), 0);

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
                <div className="bold" style={{ fontSize: 17, color: "#c2410c", marginTop: 4 }}>{cp.title}</div>
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
              <span className="tiny" style={{ opacity: 0.85 }}>Settled offline this month</span>
              <span className="bold" style={{ fontSize: 28 }}>{inr(totalSettled)}</span>
              <span className="tiny" style={{ opacity: 0.75 }}>STRYT records it — money changes hands in person</span>
            </div>
            {settlements.length === 0 ? (
              <EmptyState emoji="🧾" title="No settlements yet" text="Completed jobs you mark as paid show up here." />
            ) : (
              settlements.map((s) => (
                <div key={s.id} className="card row gap-12" style={{ padding: 14 }}>
                  <SafeImg src={s.withAvatar} variant="avatar" className="avatar" style={{ width: 44, height: 44 }} />
                  <div className="grow">
                    <div className="semi small">{s.withName}</div>
                    <div className="tiny muted">{s.note} • {s.date}</div>
                    <span className="badge badge-gray tiny" style={{ marginTop: 4 }}>{s.mode === "CASH" ? "💵 Cash" : "📲 UPI (offline)"}</span>
                  </div>
                  <div className="col" style={{ alignItems: "flex-end" }}>
                    <span className="bold">{inr(s.amount)}</span>
                    {s.tip ? <span className="tiny" style={{ color: "var(--green-500)" }}>+{inr(s.tip)} tip</span> : null}
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
