import { Check, Store, Briefcase, User, Package } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import type { AccountOption } from "@/hooks/useAccountOptions";

export const HAT_ICONS = { customer: User, business: Store, provider: Briefcase, delivery: Package } as const;
export const HAT_COLORS = {
  customer: "var(--brand-600)",
  business: "var(--orange-500)",
  provider: "var(--green-500)",
  delivery: "var(--delivery-600)",
} as const;

export function HatOptionRow({ opt, onClick }: { opt: AccountOption; onClick: () => void }) {
  const Icon = HAT_ICONS[opt.type];
  const color = HAT_COLORS[opt.type];
  return (
    <button
      className="row gap-10"
      style={{ width: "100%", padding: "8px 8px", borderRadius: 10, textAlign: "left", background: opt.active ? "var(--ink-50)" : "transparent" }}
      onClick={onClick}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <SafeImg src={opt.avatar} variant="avatar" className="avatar" style={{ width: 34, height: 34 }} />
        <span style={{ position: "absolute", bottom: -2, right: -2, width: 15, height: 15, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
          <Icon size={9} />
        </span>
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="semi small ellipsis">{opt.name}</div>
        <div className="tiny muted">{opt.sub}</div>
      </div>
      {opt.active && <Check size={16} color={color} style={{ flexShrink: 0 }} />}
    </button>
  );
}

export function HatActionRow({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button className="row gap-10" style={{ width: "100%", padding: "8px 8px", borderRadius: 10, textAlign: "left" }} onClick={onClick}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--ink-50)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{emoji}</span>
      <span className="semi small">{label}</span>
    </button>
  );
}

interface HatSwitcherListProps {
  options: AccountOption[];
  pick: (opt: AccountOption) => void;
  canAddBusiness: boolean;
  canBecomeProvider: boolean;
  onAddBusiness: () => void;
  onBecomeProvider: () => void;
  onManageAll: () => void;
  onSeeAll?: () => void;
  showSeeAll?: boolean;
}

/** Shared hat list used by RoleSwitcher dropdown and footer HatSwitcherPopover. */
export function HatSwitcherList({
  options,
  pick,
  canAddBusiness,
  canBecomeProvider,
  onAddBusiness,
  onBecomeProvider,
  onManageAll,
  onSeeAll,
  showSeeAll = false,
}: HatSwitcherListProps) {
  return (
    <>
      <div className="col gap-2">
        {options.map((opt) => (
          <HatOptionRow key={`${opt.type}:${opt.id}`} opt={opt} onClick={() => pick(opt)} />
        ))}
      </div>

      <div className="divider" style={{ margin: "8px 0" }} />

      <div className="col gap-1">
        {canAddBusiness && (
          <HatActionRow emoji="🏪" label="Add a business" onClick={onAddBusiness} />
        )}
        {canBecomeProvider && (
          <HatActionRow emoji="🛠️" label="Become a provider" onClick={onBecomeProvider} />
        )}
        <HatActionRow emoji="🗂️" label="Manage all" onClick={onManageAll} />
        {showSeeAll && onSeeAll && (
          <HatActionRow emoji="👤" label="See all accounts" onClick={onSeeAll} />
        )}
      </div>
    </>
  );
}
