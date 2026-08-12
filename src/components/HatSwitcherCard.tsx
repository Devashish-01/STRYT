import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Briefcase, ChevronRight, Heart, Store } from "@/components/Icons";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { businessService, providerService } from "@/services";
import AccountSwitcher from "@/components/AccountSwitcher";
import type { Role } from "@/types";

function themed(tint: string, accent: string): React.CSSProperties {
  return { "--pf-tint": tint, "--pf-accent": accent } as React.CSSProperties;
}

const roleMeta: Record<Role, { label: string; icon: typeof Heart; tint: string; accent: string }> = {
  customer:       { label: "Customer",  icon: Heart,     tint: "var(--brand-50)",   accent: "var(--brand-600)" },
  business_owner: { label: "Business",  icon: Store,     tint: "var(--orange-100)", accent: "var(--orange-500)" },
  provider:       { label: "Provider",  icon: Briefcase, tint: "var(--green-100)",  accent: "var(--green-600)" },
};

function activeRoleFromContext(type: string): Role {
  if (type === "business") return "business_owner";
  if (type === "provider") return "provider";
  return "customer";
}

/**
 * "I'm using STRYT as a…" role tiles + account switcher link.
 * Used on customer Profile, business Profile hub, and provider Profile hub.
 */
export default function HatSwitcherCard({ showManageLink = true }: { showManageLink?: boolean }) {
  const nav = useNavigate();
  const [switcher, setSwitcher] = useState(false);
  const {
    roles,
    activeContext,
    setActiveRole,
    attemptSwitchContext,
    ownedBusinessIds,
    ownedProviderId,
  } = useApp();

  const manageBizId = ownedBusinessIds[0];
  const hasSellerProfile = ownedBusinessIds.length > 0 || !!ownedProviderId;
  const activeRole = activeRoleFromContext(activeContext.type);

  const { data: myBizList } = useQuery(() => businessService.mine(), []);
  const { data: myProvList } = useQuery(() => providerService.mine(), []);
  const myBiz = (myBizList ?? []).find((b) => b.id === manageBizId);
  const myProv = (myProvList ?? []).find((p) => p.id === ownedProviderId);

  if (!hasSellerProfile) {
    return (
      <div className="col gap-8">
        <button className="pf-row pf-row-invite" style={themed("var(--surface)", "var(--brand-600)")} onClick={() => nav("/onboard/business")}>
          <span className="pf-row-icon"><Store size={19} /></span>
          <span className="col grow" style={{ gap: 2 }}>
            <span className="semi" style={{ fontSize: 14 }}>Create a business</span>
            <span className="tiny" style={{ fontWeight: 500 }}>List your shop so neighbours can find it</span>
          </span>
          <ChevronRight size={18} color="var(--brand-300)" />
        </button>
        <button className="pf-row pf-row-invite" style={themed("var(--surface)", "var(--green-600)")} onClick={() => nav("/onboard/provider")}>
          <span className="pf-row-icon"><Briefcase size={19} /></span>
          <span className="col grow" style={{ gap: 2 }}>
            <span className="semi" style={{ fontSize: 14 }}>Become a provider</span>
            <span className="tiny" style={{ fontWeight: 500 }}>Offer your services around the street</span>
          </span>
          <ChevronRight size={18} color="var(--green-600)" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="small semi" style={{ color: "var(--ink-600)", marginBottom: 12 }}>I&apos;m using STRYT as a…</div>
        <div className="row gap-8">
          {(["customer", "business_owner", "provider"] as Role[]).map((r) => {
            const has = roles.includes(r);
            const active = activeRole === r;
            const M = roleMeta[r];
            const Icon = M.icon;
            return (
              <button
                key={r}
                onClick={() => {
                  if (!has) {
                    nav(r === "business_owner" ? "/onboard/business" : "/onboard/provider");
                  } else if (r === "business_owner") {
                    const dest = manageBizId ? `/business/${manageBizId}/manage` : "/manage";
                    const ready = attemptSwitchContext(
                      { type: "business", id: manageBizId ?? null, name: myBiz?.name ?? "My Business" },
                      dest
                    );
                    if (ready) nav(dest);
                  } else if (r === "provider") {
                    const dest = ownedProviderId ? `/provider/${ownedProviderId}/manage` : "/manage";
                    const ready = attemptSwitchContext(
                      { type: "provider", id: ownedProviderId ?? null, name: myProv?.displayName ?? "My Provider Profile" },
                      dest
                    );
                    if (ready) nav(dest);
                  } else {
                    setActiveRole(r);
                    nav("/home");
                  }
                }}
                className={`pf-role${active ? " active" : ""}`}
                style={themed(M.tint, M.accent)}
              >
                <Icon size={22} color={M.accent} />
                <span className="tiny semi" style={{ color: active ? M.accent : "var(--ink-600)" }}>{M.label}</span>
                {!has && <span className="pf-role-add">+ Add</span>}
              </button>
            );
          })}
        </div>
        <button className="pf-subtle-link" onClick={() => setSwitcher(true)}>
          <ArrowLeftRight size={13} /> Switch or add another account
        </button>
        {showManageLink && (
          <button className="pf-subtle-link" onClick={() => nav("/manage")}>
            <Store size={13} /> Manage business &amp; profile
          </button>
        )}
      </div>
      {switcher && <AccountSwitcher onClose={() => setSwitcher(false)} />}
    </>
  );
}
