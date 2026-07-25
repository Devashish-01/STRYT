/** Account deletion grace period (Play / App Store self-serve deletion). */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export function deletionPurgeAt(requestCreatedAt: string | Date): Date {
  const base = typeof requestCreatedAt === "string" ? new Date(requestCreatedAt) : requestCreatedAt;
  return new Date(base.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export function deletionDaysRemaining(requestCreatedAt: string | Date, now = Date.now()): number {
  const msLeft = deletionPurgeAt(requestCreatedAt).getTime() - now;
  return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
}
