import type { AgreementStatus } from "@/types";

/**
 * The agreement state machine as the app needs it. The server is the authority: agreements have no client UPDATE policy and
 * every move is an `agreement_*` function (PENDING -> ACTIVE -> DEPOSIT_PAID -> IN_PROGRESS -> REVIEW -> COMPLETED, plus
 * CANCELLED, and DISPUTED until an admin resolves it).
 *
 * "Closed" = the two parties can do nothing more with it. DISPUTED counts: only an admin moves it on. This set used to be
 * copied into four files (GAPS #46); ask here instead.
 */
export const AGREEMENT_CLOSED: readonly AgreementStatus[] = ["COMPLETED", "CANCELLED", "DISPUTED"];

export function isAgreementClosed(status: AgreementStatus): boolean {
  return AGREEMENT_CLOSED.includes(status);
}

/** The same set as a PostgREST `in` list, e.g. `.not("status", "in", agreementClosedFilter())`. */
export function agreementClosedFilter(): string {
  return `(${AGREEMENT_CLOSED.map((s) => `"${s}"`).join(",")})`;
}
