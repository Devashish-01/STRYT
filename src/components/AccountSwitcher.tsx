import { Check, Store, Briefcase, User, Plus, ChevronRight } from "@/components/Icons";
import { SafeImg } from "./common";
import { useAccountOptions, type AccountOption } from "@/hooks/useAccountOptions";

const ICONS = { customer: User, business: Store, provider: Briefcase } as const;
const COLORS = { customer: "var(--brand-600)", business: "var(--orange-500)", provider: "var(--green-500)" } as const;

export default function AccountSwitcher({ onClose }: { onClose: () => void }) {
  const { options, pick, canAddBusiness, canBecomeProvider, nav } = useAccountOptions();

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold h2" style={{ marginBottom: 4 }}>Switch account</h3>
        <p className="small muted" style={{ marginBottom: 14 }}>One login, all your hats. Pick what you're managing.</p>

        <div className="col gap-8">
          {options.map((opt) => (
            <Row key={`${opt.type}:${opt.id}`} opt={opt} onClick={() => { pick(opt); onClose(); }} />
          ))}
        </div>

        <div className="divider" />

        {canAddBusiness && (
          <button className="row gap-12" style={{ width: "100%", padding: "12px 4px" }} onClick={() => { onClose(); nav("/onboard/business"); }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--orange-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={20} color="var(--orange-500)" /></div>
            <span className="semi small grow" style={{ textAlign: "left" }}>Add a business</span>
            <ChevronRight size={18} color="var(--ink-300)" />
          </button>
        )}
        {canBecomeProvider && (
          <button className="row gap-12" style={{ width: "100%", padding: "12px 4px" }} onClick={() => { onClose(); nav("/onboard/provider"); }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--green-100)", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={20} color="var(--green-500)" /></div>
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

function Row({ opt, onClick }: { opt: AccountOption; onClick: () => void }) {
  const Icon = ICONS[opt.type];
  const color = COLORS[opt.type];
  return (
    <button className="card row gap-12" style={{ padding: 12, textAlign: "left", border: opt.active ? `2px solid ${color}` : "1px solid var(--line)" }} onClick={onClick}>
      <div style={{ position: "relative" }}>
        <SafeImg src={opt.avatar} variant="avatar" className="avatar" style={{ width: 44, height: 44 }} />
        <span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}><Icon size={14} /></span>
      </div>
      <div className="grow">
        <div className="semi small">{opt.name}</div>
        <div className="tiny muted">{opt.sub}</div>
      </div>
      {opt.active && <Check size={20} color={color} />}
    </button>
  );
}
