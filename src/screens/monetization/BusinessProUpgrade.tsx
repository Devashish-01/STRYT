import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, inr } from "@/components/common";
import { Check, Zap, Star, Crown } from "lucide-react";
import { proService, PRO_PLANS, LEAD_PACKS } from "@/services/proService";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { Skeleton } from "@/components/states";

const PLAN_ICONS = { BASIC: Zap, PRO: Star, PREMIUM: Crown };
const PLAN_COLOR = { BASIC: "#0ea5e9", PRO: "#6b21cc", PREMIUM: "#f59e0b" };

export default function BusinessProUpgrade() {
  const { id = "" } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { showToast } = useApp();
  const { data: proStatus, loading } = useQuery(() => proService.getBusinessProStatus(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);

  async function purchase(planId: string) {
    setBusy(planId);
    try {
      const { orderId, amount, keyId } = await proService.purchasePlan("BUSINESS", id, planId);

      await new Promise<void>((res, rej) => {
        const loadRazorpay = () => new Promise<void>((r) => {
          if ((window as any).Razorpay) { r(); return; }
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => r();
          document.head.appendChild(s);
        });
        loadRazorpay().then(() => {
          const rzp = new (window as any).Razorpay({
            key: keyId, amount, currency: "INR", name: "Naya",
            description: `Naya ${planId} Plan`,
            order_id: orderId,
            handler: async (response: any) => {
              try {
                await proService.activatePlan("BUSINESS", id, planId, orderId);
                showToast("Plan activated ✓");
                nav(-1);
                res();
              } catch { rej(new Error("Activation failed")); }
            },
            theme: { color: "#6b21cc" },
          });
          rzp.on("payment.failed", () => rej(new Error("Payment failed")));
          rzp.open();
        });
      });
    } catch (e: any) {
      showToast(e.message || "Payment failed");
    } finally { setBusy(null); }
  }

  if (loading) return <div className="screen"><AppBar title="Upgrade" /><div className="page-pad"><Skeleton h={200} /></div></div>;

  return (
    <div className="screen">
      <AppBar title="Business Pro" subtitle="Grow your business on Naya" />
      <div className="screen-scroll page-pad col gap-14" style={{ paddingTop: 16 }}>

        {proStatus?.isPro && (
          <div className="card row gap-10" style={{ padding: 12, background: "#faf5ff", border: "1px solid #e9d5ff" }}>
            <Star size={20} color="#6b21cc" style={{ flexShrink: 0 }} />
            <div>
              <div className="semi small" style={{ color: "#6b21cc" }}>You're on a Pro plan</div>
              <div className="tiny muted">Valid until {proStatus.proUntil ? new Date(proStatus.proUntil).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}</div>
            </div>
          </div>
        )}

        <div className="semi small" style={{ marginBottom: -4 }}>Business Plans</div>
        {PRO_PLANS.map((plan) => {
          const Icon = PLAN_ICONS[plan.id as keyof typeof PLAN_ICONS];
          const color = PLAN_COLOR[plan.id as keyof typeof PLAN_COLOR];
          const isPopular = plan.id === "PRO";
          return (
            <div key={plan.id} className="card col gap-12" style={{ padding: 16, border: isPopular ? `2px solid ${color}` : "1px solid var(--line)", position: "relative" }}>
              {isPopular && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: color, color: "#fff", borderRadius: 20, padding: "2px 14px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                  Most popular
                </div>
              )}
              <div className="row between">
                <div className="row gap-8">
                  <Icon size={20} color={color} />
                  <span className="bold">{plan.label}</span>
                </div>
                <div>
                  <span className="bold" style={{ fontSize: 20, color }}>{inr(plan.price)}</span>
                  <span className="tiny muted"> / {plan.duration}</span>
                </div>
              </div>
              <div className="col gap-6">
                {plan.features.map((f) => (
                  <div key={f} className="row gap-8 tiny">
                    <Check size={13} color="#16a34a" style={{ flexShrink: 0 }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-block" disabled={busy === plan.id}
                style={{ background: color, color: "#fff" }}
                onClick={() => purchase(plan.id)}>
                {busy === plan.id ? "Opening payment…" : `Get ${plan.label}`}
              </button>
            </div>
          );
        })}

        <div className="semi small" style={{ marginTop: 8, marginBottom: -4 }}>Lead Packs (Providers)</div>
        {LEAD_PACKS.map((pack) => (
          <div key={pack.id} className="card row between" style={{ padding: 14 }}>
            <div>
              <div className="semi small">{pack.label}</div>
              <div className="tiny muted">Unlock {pack.credits} priority leads</div>
            </div>
            <button className="btn btn-outline btn-sm" disabled={busy === pack.id} onClick={() => purchase(pack.id)}>
              {inr(pack.price)}
            </button>
          </div>
        ))}

        <div className="card row gap-10" style={{ padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <Check size={18} color="#16a34a" style={{ flexShrink: 0 }} />
          <span className="tiny" style={{ color: "#15803d", lineHeight: 1.4 }}>
            <span className="semi">Zero commission.</span> Naya never takes a cut on your jobs. Pro is purely for growth tools.
          </span>
        </div>
      </div>
    </div>
  );
}
