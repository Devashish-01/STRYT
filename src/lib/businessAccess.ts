import { createContext, useContext } from "react";
import type { AccessLevel, Scope } from "@/services/marketplace/businessAccessService";
import type { ConsoleMode } from "@/lib/teamConsole";

export interface BusinessAccessValue {
  isOwner: boolean;
  accessLevel: AccessLevel;
  scopes: Scope[];
  hasScope: (scope: Scope) => boolean;
  consoleMode: ConsoleMode;
  scopeLabel: string;
  hasActiveDeliveries: boolean;
}

export const FULL_ACCESS: BusinessAccessValue = {
  isOwner: true,
  accessLevel: "FULL",
  scopes: [],
  hasScope: () => true,
  consoleMode: "owner",
  scopeLabel: "",
  hasActiveDeliveries: false,
};

/**
 * The context default, used only when a component calls useBusinessAccess()
 * outside this guard's provider. It denies everything on purpose: the default
 * used to be FULL_ACCESS, which meant any such component — a screen mounted on
 * a route that forgot the guard, or one rendering during a route transition —
 * silently rendered as if the viewer owned the business.
 */
const NO_ACCESS: BusinessAccessValue = {
  isOwner: false,
  accessLevel: "SCOPED",
  scopes: [],
  hasScope: () => false,
  consoleMode: "team_member",
  scopeLabel: "",
  hasActiveDeliveries: false,
};

export const BusinessAccessContext = createContext<BusinessAccessValue>(NO_ACCESS);

/**
 * What can the current user do in THIS business's manage console — owner,
 * a FULL delegate, or a SCOPED team member (only the sections in `scopes`).
 */
export function useBusinessAccess() {
  return useContext(BusinessAccessContext);
}
