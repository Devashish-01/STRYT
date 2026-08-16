import {
  Check,
  Store,
  Briefcase,
  User,
  Package,
  LayoutGrid,
  Users,
} from "@/components/Icons";
import { SafeImg } from "@/components/common";
import type { AccountOption } from "@/hooks/useAccountOptions";
import { haptics } from "@/lib/haptics";

export const HAT_ICONS = { customer: User, business: Store, provider: Briefcase, delivery: Package } as const;
export const HAT_COLORS = {
  customer: "var(--brand-600)",
  business: "var(--orange-500)",
  provider: "var(--green-600)",
  delivery: "var(--delivery-600)",
} as const;

export const HAT_BG_TINTS = {
  customer: "var(--brand-50)",
  business: "var(--orange-50)",
  provider: "var(--green-100)",
  delivery: "var(--delivery-50)",
} as const;

export function HatOptionRow({ opt, onClick }: { opt: AccountOption; onClick: () => void }) {
  const Icon = HAT_ICONS[opt.type];
  const color = HAT_COLORS[opt.type];
  const bgTint = HAT_BG_TINTS[opt.type];
  return (
    <button
      className="row gap-10"
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 12,
        textAlign: "left",
        background: opt.active ? bgTint : "transparent",
        border: opt.active ? `1px solid ${color}` : "1px solid transparent",
        transition: "all 0.15s ease",
      }}
      onClick={() => {
        haptics.selection();
        onClick();
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <SafeImg src={opt.avatar} variant="avatar" className="avatar" style={{ width: 34, height: 34, borderRadius: 10 }} />
        <span
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: color,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--surface)",
          }}
        >
          <Icon size={9} />
        </span>
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="semi small ellipsis" style={{ color: "var(--ink-900)" }}>{opt.name}</div>
        <div className="tiny muted ellipsis">{opt.sub}</div>
      </div>
      {opt.active && <Check size={16} color={color} style={{ flexShrink: 0 }} />}
    </button>
  );
}

export function HatActionRow({
  icon: ActionIcon,
  tint,
  color,
  label,
  onClick,
}: {
  icon: typeof Store;
  tint: string;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="row gap-10"
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 12,
        textAlign: "left",
        transition: "background 0.15s ease",
      }}
      onClick={() => {
        haptics.selection();
        onClick();
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: tint,
          color: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <ActionIcon size={17} />
      </span>
      <span className="semi small" style={{ color: "var(--ink-900)" }}>{label}</span>
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
          <HatActionRow
            icon={Store}
            tint="var(--orange-50)"
            color="var(--orange-500)"
            label="Add a business"
            onClick={onAddBusiness}
          />
        )}
        {canBecomeProvider && (
          <HatActionRow
            icon={Briefcase}
            tint="var(--green-100)"
            color="var(--green-600)"
            label="Become a provider"
            onClick={onBecomeProvider}
          />
        )}
        <HatActionRow
          icon={LayoutGrid}
          tint="var(--brand-50)"
          color="var(--brand-600)"
          label="Manage all"
          onClick={onManageAll}
        />
        {showSeeAll && onSeeAll && (
          <HatActionRow
            icon={Users}
            tint="var(--ink-100)"
            color="var(--ink-700)"
            label="See all accounts"
            onClick={onSeeAll}
          />
        )}
      </div>
    </>
  );
}
