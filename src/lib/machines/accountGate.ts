import type { CurrentUser } from "@/types/user";
import { LEGAL_VERSION } from "@/lib/legal";

/**
 * The signed-in account's gate: what must happen before the app proper, in this order.
 *   DELETION_PENDING  the account is scheduled for deletion -> /auth/deletion-pending
 *   TERMS             the current terms (LEGAL_VERSION) are not accepted -> /auth/terms
 *   ONBOARD           first-login onboarding is not finished -> /auth/onboard
 *   READY             nothing outstanding
 *
 * The three route layouts in App.tsx (GuestOrAuthLayout, ProtectedLayout, PublicOnlyLayout) each used to re-implement this
 * order by hand (GAPS #46). They still decide what to do on their own paths; the order lives only here.
 */
export type AccountGate = "DELETION_PENDING" | "TERMS" | "ONBOARD" | "READY";

export function accountGate(
  user: Pick<CurrentUser, "deletionScheduledAt" | "termsAcceptedVersion" | "onboardingCompletedAt">,
  legalVersion: string = LEGAL_VERSION,
): AccountGate {
  if (user.deletionScheduledAt) return "DELETION_PENDING";
  if (user.termsAcceptedVersion !== legalVersion) return "TERMS";
  // Explicitly null = not finished. Undefined means the field wasn't loaded, which the layouts treat as finished (unchanged).
  if (user.onboardingCompletedAt === null) return "ONBOARD";
  return "READY";
}

/** True while Supabase OAuth / magic-link is landing its token in the URL: no layout may redirect yet. */
export function isAuthCallbackUrl(loc: Pick<Location, "hash" | "search"> = window.location): boolean {
  return loc.hash.includes("access_token=") || loc.hash.includes("error=") || loc.search.includes("code=");
}
