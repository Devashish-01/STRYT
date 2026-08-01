import type { AccessLevel } from "@/services/marketplace/businessAccessService";
import { SCOPE_LABELS, type Scope } from "@/services/marketplace/businessAccessService";

export type ConsoleMode = "owner" | "full_delegate" | "team_member";

const SCOPE_ORDER: Scope[] = ["queue", "appointments", "catalog", "leads", "delivery"];

export function resolveConsoleMode(isOwner: boolean, accessLevel: AccessLevel): ConsoleMode {
  if (isOwner) return "owner";
  if (accessLevel === "FULL") return "full_delegate";
  return "team_member";
}

export function buildScopeLabel(hasScope: (scope: Scope) => boolean): string {
  const labels = SCOPE_ORDER.filter(hasScope).map((s) => SCOPE_LABELS[s]);
  return labels.join(" · ") || "No access yet";
}
