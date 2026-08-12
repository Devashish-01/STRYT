import {
  BUSINESS_PACKAGES,
  type BizConsole,
  type BusinessPackage,
  type ConsoleCapability,
  type ConsoleStep,
} from "./businessPackages";

/** What a screen knows about one capability: whether it's done, and where it goes. */
export interface CapabilityState {
  /** Only meaningful for setup steps; action tiles ignore it. */
  done?: boolean;
  onClick: () => void;
  /** Optional live value for an action tile ("12 dishes"), overriding the config hint. */
  value?: string;
}

export interface ResolvedStep {
  id: ConsoleCapability;
  label: string;
  hint?: string;
  done: boolean;
  onClick: () => void;
}

/**
 * The package decides WHICH capabilities matter, in what order, and what to
 * call them. The calling screen decides what each one actually does and
 * whether it's complete.
 *
 * A capability the caller doesn't supply is DROPPED rather than rendered dead —
 * that's how a provider (no queue, no delivery) and a business can share one
 * config shape without either faking a capability it doesn't have.
 */
export function buildConsoleSteps(
  steps: ConsoleStep[],
  state: Partial<Record<ConsoleCapability, CapabilityState>>
): ResolvedStep[] {
  return steps.flatMap((step) => {
    const s = state[step.id];
    if (!s) return [];
    return [{
      id: step.id,
      label: step.label,
      hint: s.value ?? step.hint,
      done: s.done === true,
      onClick: s.onClick,
    }];
  });
}

/**
 * A provider's untouched console said "Set your availability" where a
 * business said "Set your hours", and "Add a service to your catalog" where a
 * business said "Add a catalog item". Same capabilities, different trade words
 * — so the *fallback* is role-aware even though an authored package config
 * (dining, takeaway) is shared by both. Keeps the "generic is byte-for-byte
 * unchanged" promise on both sides.
 */
const GENERIC_PROVIDER_CONSOLE: BizConsole = {
  setupTitle: "Finish setting up your profile",
  setup: [
    { id: "catalog", label: "Add a service to your catalog" },
    { id: "hours", label: "Set your availability" },
    { id: "verify", label: "Upload verification" },
    { id: "promote", label: "Post your first community update" },
  ],
  actions: [
    { id: "catalog", label: "Services", hint: "What you offer" },
    { id: "bookings", label: "Jobs", hint: "Your schedule" },
    { id: "hours", label: "Availability", hint: "When you work" },
    { id: "payments", label: "Money", hint: "Earnings & payments" },
  ],
  storeTabLabel: "Services",
};

/**
 * Every package's console block, with the role's generic as the fallback — the
 * same default-to-generic idiom AppointmentSheet/PaymentSheet already use for
 * `vocabulary`. A package that hasn't authored a console keeps exactly today's.
 */
function genericConsoleFor(kind: "business" | "provider"): BizConsole {
  return kind === "provider"
    ? GENERIC_PROVIDER_CONSOLE
    : (BUSINESS_PACKAGES.generic.console as BizConsole);
}

export function consoleFor(
  pkg: BusinessPackage,
  kind: "business" | "provider" = "business"
): BizConsole {
  // `generic` is the ABSENCE of a theme, not a theme — so it resolves to the
  // role's own default rather than the business wording it happens to store.
  // (Reading the key here is the same narrow exception the codebase already
  // makes for generic in BusinessDetail/ProviderDetail/PackageConfirmCard;
  // no *themed* package is ever branched on.)
  if (pkg.key === "generic") return genericConsoleFor(kind);
  return pkg.console ?? genericConsoleFor(kind);
}
