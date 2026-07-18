import type { AppointmentRecord, QueueOwnerToken } from "@/types";

/**
 * "How much has this business/provider recorded, and how much is still
 * waiting for confirmation" — computed independently in ManageDashboard.tsx
 * and BusinessHub.tsx from the same two arrays before this was extracted.
 * Kept here (pure, no fetching) rather than on a service, matching
 * src/utils/availability.ts's role as shared client-side derivation logic
 * consumed by both the business and provider dashboards.
 */
export function deriveMoneySummary(appointments: AppointmentRecord[], queueTokens: QueueOwnerToken[]) {
  const appointmentClaims = appointments.filter((a) => a.paymentStatus === "PENDING_CONFIRM");
  const queueClaims = queueTokens.filter((t) => t.paymentStatus === "PENDING_CONFIRM");
  const paidRecords = [
    ...appointments.filter((a) => a.paymentStatus === "PAID"),
    ...queueTokens.filter((t) => t.paymentStatus === "PAID"),
  ];
  const recordedAmount = paidRecords.reduce((sum, item) => sum + (item.paymentAmount ?? 0), 0);
  return {
    appointmentClaims,
    queueClaims,
    paymentClaims: appointmentClaims.length + queueClaims.length,
    paidRecords,
    recordedAmount,
  };
}
