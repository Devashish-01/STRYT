import { useEffect } from "react";
import {
  Check,
  Store,
  Briefcase,
  User,
  Plus,
  ChevronRight,
  Package,
  X,
  LayoutGrid,
  Sparkles,
} from "@/components/Icons";
import { SafeImg } from "./common";
import { useAccountOptions, type AccountOption } from "@/hooks/useAccountOptions";
import { haptics } from "@/lib/haptics";

const ICONS = {
  customer: User,
  business: Store,
  provider: Briefcase,
  delivery: Package,
} as const;

const COLORS = {
  customer: "var(--brand-600)",
  business: "var(--orange-500)",
  provider: "var(--green-600)",
  delivery: "var(--delivery-600)",
} as const;

const BG_TINTS = {
  customer: "var(--brand-50)",
  business: "var(--orange-50)",
  provider: "var(--green-100)",
  delivery: "var(--delivery-50)",
} as const;

export default function AccountSwitcher({ onClose }: { onClose: () => void }) {
  const { options, pick, canAddBusiness, canBecomeProvider, nav } = useAccountOptions();

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function handleSelect(opt: AccountOption) {
    haptics.selection();
    pick(opt);
    onClose();
  }

  return (
    <div className="account-drawer-backdrop" onClick={onClose} aria-label="Dismiss">
      <div
        className="account-drawer-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Switch account"
      >
        <div className="account-drawer-handle" />

        <div className="account-drawer-header">
          <div>
            <h3 className="bold h3" style={{ margin: 0, color: "var(--ink-900)" }}>
              Switch Account
            </h3>
            <p className="tiny muted" style={{ margin: "3px 0 0", color: "var(--ink-500)" }}>
              One login, all your hats. Pick what you&apos;re managing.
            </p>
          </div>
          <button
            className="account-drawer-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="col gap-8" style={{ marginBottom: 16 }}>
          {options.map((opt) => (
            <RoleCard
              key={`${opt.type}:${opt.id}`}
              opt={opt}
              onClick={() => handleSelect(opt)}
            />
          ))}
        </div>

        <div className="divider" style={{ margin: "14px 0" }} />

        <div className="col gap-6">
          {canAddBusiness && (
            <button
              className="account-action-card"
              onClick={() => {
                haptics.selection();
                onClose();
                nav("/onboard/business");
              }}
            >
              <div
                className="account-action-icon-wrap"
                style={{ background: "var(--orange-50)", color: "var(--orange-500)" }}
              >
                <Store size={20} />
              </div>
              <div className="grow" style={{ textAlign: "left" }}>
                <div className="semi small" style={{ color: "var(--ink-900)" }}>
                  Add a business
                </div>
                <div className="tiny muted">List your store &amp; catalog on STRYT</div>
              </div>
              <Plus size={16} color="var(--orange-500)" />
            </button>
          )}

          {canBecomeProvider && (
            <button
              className="account-action-card"
              onClick={() => {
                haptics.selection();
                onClose();
                nav("/onboard/provider");
              }}
            >
              <div
                className="account-action-icon-wrap"
                style={{ background: "var(--green-100)", color: "var(--green-600)" }}
              >
                <Briefcase size={20} />
              </div>
              <div className="grow" style={{ textAlign: "left" }}>
                <div className="semi small" style={{ color: "var(--ink-900)" }}>
                  Become a provider
                </div>
                <div className="tiny muted">Offer local services &amp; get booked</div>
              </div>
              <Sparkles size={16} color="var(--green-600)" />
            </button>
          )}

          <button
            className="account-action-card"
            onClick={() => {
              haptics.selection();
              onClose();
              nav("/manage");
            }}
          >
            <div
              className="account-action-icon-wrap"
              style={{ background: "var(--brand-50)", color: "var(--brand-600)" }}
            >
              <LayoutGrid size={20} />
            </div>
            <div className="grow" style={{ textAlign: "left" }}>
              <div className="semi small" style={{ color: "var(--ink-900)" }}>
                Manage all spaces
              </div>
              <div className="tiny muted">Hub for all your businesses and profiles</div>
            </div>
            <ChevronRight size={16} color="var(--ink-400)" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleCard({ opt, onClick }: { opt: AccountOption; onClick: () => void }) {
  const Icon = ICONS[opt.type];
  const color = COLORS[opt.type];
  const bgTint = BG_TINTS[opt.type];

  return (
    <button
      className={`account-role-card ${opt.active ? "active" : ""}`}
      style={
        opt.active
          ? {
              background: bgTint,
              borderColor: color,
            }
          : undefined
      }
      onClick={onClick}
    >
      <div className="account-role-avatar-wrap">
        <SafeImg
          src={opt.avatar}
          variant="avatar"
          className="account-role-avatar"
          style={{ width: 42, height: 42 }}
        />
        <span
          className="account-role-badge"
          style={{ background: color }}
        >
          <Icon size={10} />
        </span>
      </div>

      <div className="grow" style={{ minWidth: 0 }}>
        <div className="semi small ellipsis" style={{ color: "var(--ink-900)", fontWeight: 600 }}>
          {opt.name}
        </div>
        <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>
          {opt.sub}
        </div>
      </div>

      {opt.active ? (
        <span
          className="account-role-active-pill"
          style={{ background: bgTint, color }}
        >
          <Check size={12} strokeWidth={3} />
          Active
        </span>
      ) : (
        <ChevronRight size={16} color="var(--ink-300)" style={{ flexShrink: 0 }} />
      )}
    </button>
  );
}
