import type { AccessLevel } from "@/services/marketplace/businessAccessService";
import { SCOPE_LABEL_KEYS, type Scope } from "@/services/marketplace/businessAccessService";

export type ConsoleMode = "owner" | "full_delegate" | "team_member";

const SCOPE_ORDER: Scope[] = ["queue", "appointments", "catalog", "leads", "delivery"];

export function resolveConsoleMode(isOwner: boolean, accessLevel: AccessLevel): ConsoleMode {
  if (isOwner) return "owner";
  if (accessLevel === "FULL") return "full_delegate";
  return "team_member";
}

export function buildScopeLabel(hasScope: (scope: Scope) => boolean, t: (key: string) => string): string {
  const labels = SCOPE_ORDER.filter(hasScope).map((s) => t(SCOPE_LABEL_KEYS[s]));
  return labels.join(" · ") || t("scope_none_yet");
}
