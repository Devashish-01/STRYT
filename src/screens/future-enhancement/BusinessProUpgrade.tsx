import { useParams } from "react-router-dom";
import { AppBar, inr } from "@/components/common";
import { Check, Zap, Star, Crown } from "@/components/Icons";
import { proService, PRO_PLANS, LEAD_PACKS } from "@/services/core/proService";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { Skeleton } from "@/components/states";

const PLAN_ICONS = { BASIC: Zap, PRO: Star, PREMIUM: Crown };
const PLAN_COLOR = { BASIC: "var(--blue-500)", PRO: "var(--brand-700)", PREMIUM: "var(--amber-500)" };

export default function BusinessProUpgrade() {
  const { id = "" } = useParams<{ id: string }>();
  const { showToast } = useApp();
  const { data: proStatus, loading } = useQuery(() => proService.getBusinessProStatus(id), [id]);

  // Paid upgrades aren't wired to a payment provider yet — the old Razorpay
  // checkout was removed (STRYT uses UPI-deeplink payments only). This screen
  // is unrouted until a UPI-based Pro purchase flow is built.
  function purchase(_planId: string) {
    showToast("Pro plans aren't available for purchase yet — coming soon");
  }

  if (loading) return <div className="screen"><AppBar title="Upgrade" /><div className="page-pad"><Skeleton h={200} /></div></div>;

  return (
    <div className="screen">
      <AppBar title="Business Pro" subtitle="Grow your business on STRYT" />
      <div className="screen-scroll page-pad col gap-14" style={{ paddingTop: 16 }}>

        {proStatus?.isPro && (
          <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}>
            <Star size={20} color="var(--brand-700)" style={{ flexShrink: 0 }} />
            <div>
              <div className="semi small" style={{ color: "var(--brand-700)" }}>You're on a Pro plan</div>
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
                    <Check size={13} color="var(--green-500)" style={{ flexShrink: 0 }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-block"
                style={{ background: color, color: "#fff" }}
                onClick={() => purchase(plan.id)}>
                {`Get ${plan.label}`}
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
            <button className="btn btn-outline btn-sm" onClick={() => purchase(pack.id)}>
              {inr(pack.price)}
            </button>
          </div>
        ))}

        <div className="card row gap-10" style={{ padding: 12, background: "var(--green-100)", border: "1px solid var(--green-500)" }}>
          <Check size={18} color="var(--green-500)" style={{ flexShrink: 0 }} />
          <span className="tiny" style={{ color: "var(--green-600)", lineHeight: 1.4 }}>
            <span className="semi">Zero commission.</span> STRYT never takes a cut on your jobs. Pro is purely for growth tools.
          </span>
        </div>
      </div>
    </div>
  );
}
