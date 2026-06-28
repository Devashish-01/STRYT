import { useNavigate } from "react-router-dom";
import { Check, Store, Briefcase, User, Plus, ChevronRight } from "lucide-react";
import { useApp } from "@/store";
import { useQuery } from "@/hooks/useApi";
import { businessService, providerService } from "@/services";
import { SafeImg } from "./common";

export default function AccountSwitcher({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { user, activeContext, setContext, ownedBusinessIds, ownedProviderId, roles, showToast } = useApp();

  // Pull the user's REAL listings (not mock seed data) so owned businesses /
  // provider profiles actually appear and can be switched into.
  const { data: myBiz } = useQuery(() => businessService.mine(), []);
  const { data: myProv } = useQuery(() => providerService.mine(), []);

  const businesses = (myBiz ?? []).filter((b) => ownedBusinessIds.length === 0 || ownedBusinessIds.includes(b.id));
  const provider = (myProv ?? []).find((p) => !ownedProviderId || p.id === ownedProviderId) ?? null;

  function pick(type: "customer" | "business" | "provider", id: string | null, name: string, dest: string) {
    setContext({ type, id, name });
    showToast(`Switched to ${name}`);
    onClose();
    nav(dest);
  }

  const isActive = (type: string, id: string | null) => activeContext.type === type && activeContext.id === id;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold" style={{ fontSize: 18, marginBottom: 4 }}>Switch account</h3>
        <p className="small muted" style={{ marginBottom: 14 }}>One login, all your hats. Pick what you're managing.</p>

        <div className="col gap-8">
          {/* Customer (the real logged-in user) */}
          <Row
            active={isActive("customer", null)}
            avatar={user.avatar}
            icon={<User size={14} />}
            title={user.name}
            sub="Personal · Customer"
            color="#7c3aed"
            onClick={() => pick("customer", null, user.name, "/home")}
          />

          {/* Businesses */}
          {businesses.map((b) => (
            <Row
              key={b.id}
              active={isActive("business", b.id)}
              avatar={b.coverImage}
              icon={<Store size={14} />}
              title={b.name}
              sub="Business · Live"
              color="#f26a00"
              onClick={() => pick("business", b.id, b.name, `/business/${b.id}/manage`)}
            />
          ))}

          {/* Provider */}
          {provider && (
            <Row
              active={isActive("provider", provider.id)}
              avatar={provider.avatar}
              icon={<Briefcase size={14} />}
              title={provider.displayName}
              sub="Provider · Active"
              color="#16a34a"
              onClick={() => pick("provider", provider.id, provider.displayName, `/provider/${provider.id}/manage`)}
            />
          )}
        </div>

        <div className="divider" />

        <button className="row gap-12" style={{ width: "100%", padding: "12px 4px" }} onClick={() => { onClose(); nav("/onboard/business"); }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fff3e8", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={20} color="#f26a00" /></div>
          <span className="semi small grow" style={{ textAlign: "left" }}>Add a business</span>
          <ChevronRight size={18} color="var(--ink-300)" />
        </button>
        {!provider && !roles.includes("provider") && (
          <button className="row gap-12" style={{ width: "100%", padding: "12px 4px" }} onClick={() => { onClose(); nav("/onboard/provider"); }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#e8f7ee", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={20} color="#16a34a" /></div>
            <span className="semi small grow" style={{ textAlign: "left" }}>Become a provider</span>
            <ChevronRight size={18} color="var(--ink-300)" />
          </button>
        )}
        <button className="row gap-12" style={{ width: "100%", padding: "12px 4px" }} onClick={() => { onClose(); nav("/manage"); }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>🗂️</div>
          <span className="semi small grow" style={{ textAlign: "left" }}>Manage all</span>
          <ChevronRight size={18} color="var(--ink-300)" />
        </button>
      </div>
    </div>
  );
}

function Row({ active, avatar, icon, title, sub, color, badge, onClick }: {
  active: boolean; avatar: string; icon: React.ReactNode; title: string; sub: string; color: string; badge?: number; onClick: () => void;
}) {
  return (
    <button className="card row gap-12" style={{ padding: 12, textAlign: "left", border: active ? `2px solid ${color}` : "1px solid var(--line)" }} onClick={onClick}>
      <div style={{ position: "relative" }}>
        <SafeImg src={avatar} variant="avatar" className="avatar" style={{ width: 44, height: 44 }} />
        <span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{icon}</span>
      </div>
      <div className="grow">
        <div className="semi small">{title}</div>
        <div className="tiny muted">{sub}</div>
      </div>
      {badge ? <span className="badge badge-red">{badge} new</span> : null}
      {active && <Check size={20} color={color} />}
    </button>
  );
}
