import type { AppointmentRecord, CustomPayment, QueueOwnerToken } from "@/types";

/**
 * "How much has this business/provider recorded, and how much is still
 * waiting for confirmation" — computed independently in ManageDashboard.tsx
 * and BusinessHub.tsx from the same arrays before this was extracted.
 * Kept here (pure, no fetching) rather than on a service, matching
 * src/utils/availability.ts's role as shared client-side derivation logic
 * consumed by both the business and provider dashboards.
 *
 * customPayments is optional so existing callers that haven't wired the
 * fetch yet still compile — but a business with a pending "pay any amount"
 * claim and no custom payments passed in will simply undercount, so wire
 * it wherever this feeds an "action needed" surface.
 */
export function deriveMoneySummary(appointments: AppointmentRecord[], queueTokens: QueueOwnerToken[], customPayments: CustomPayment[] = []) {
  const appointmentClaims = appointments.filter((a) => a.paymentStatus === "PENDING_CONFIRM");
  const queueClaims = queueTokens.filter((t) => t.paymentStatus === "PENDING_CONFIRM");
  const customClaims = customPayments.filter((c) => c.status === "PENDING_CONFIRM");
  const paidRecords = [
    ...appointments.filter((a) => a.paymentStatus === "PAID"),
    ...queueTokens.filter((t) => t.paymentStatus === "PAID"),
  ];
  const recordedAmount = paidRecords.reduce((sum, item) => sum + (item.paymentAmount ?? 0), 0)
    + customPayments.filter((c) => c.status === "PAID").reduce((sum, c) => sum + (c.amount ?? 0), 0);
  return {
    appointmentClaims,
    queueClaims,
    customClaims,
    paymentClaims: appointmentClaims.length + queueClaims.length + customClaims.length,
    paidRecords,
    recordedAmount,
  };
}
