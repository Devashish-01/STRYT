import { createContext, useContext } from "react";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { useBusinessAccess } from "@/lib/businessAccess";
import { partitionDashboardWork } from "@/lib/dashboardOrders";
import { appointmentService, bulkService, businessService, customPaymentService } from "@/services";
import type { QueueOwnerToken } from "@/types";
import { deriveMoneySummary } from "@/utils/paymentSummary";
import { todaysAppointments, upcomingAppointments } from "./capabilities";
import { useShopStatus } from "./useShopStatus";

export function countBusinessActions({
  bookings, appointmentClaims, customClaims, queueClaims, questions, bulkClaims,
}: {
  bookings: number; appointmentClaims: number; customClaims: number;
  queueClaims: number; questions: number; bulkClaims: number;
}, access: { appointments: boolean; queue: boolean; leads: boolean; catalog: boolean }) {
  return (access.appointments ? bookings + appointmentClaims + customClaims : 0)
    + (access.queue ? queueClaims : 0)
    + (access.leads ? questions : 0)
    + (access.catalog ? bulkClaims : 0);
}

function useScopedWork<T>(enabled: boolean, id: string, read: () => Promise<T>, table: string, cacheKey: string, filter?: string) {
  const query = useQueryWithRealtime(
    () => enabled ? read() : Promise.resolve(undefined),
    enabled ? table : null, [id, enabled], filter, enabled ? cacheKey : undefined,
  );
  return enabled ? query : { ...query, data: undefined, error: null, loading: false };
}

/** One copy of the action queue feeds Home, Dashboard and the mobile badge on every manage screen. */
export function useLoadBusinessConsoleData(id: string) {
  const { hasScope, isOwner } = useBusinessAccess();
  const permissions = {
    appointments: hasScope("appointments"), queue: hasScope("queue"),
    leads: hasScope("leads"), catalog: hasScope("catalog"),
  };
  const shop = useQueryWithRealtime(() => businessService.get(id), "businesses", [id], `id=eq.${id}`, `business:${id}`);
  const status = useShopStatus(id, shop.data, isOwner, shop.refetch);
  const appointments = useScopedWork(permissions.appointments, id, () => appointmentService.listForTarget(id), "appointments", `business:${id}:appointments-owner`, `target_id=eq.${id}`);
  const queue = useScopedWork(permissions.queue, id, () => businessService.queueOwnerState(id), "queue_tokens", `queue:${id}`, `business_id=eq.${id}`);
  const custom = useScopedWork(isOwner, id, () => customPaymentService.listForTarget("BUSINESS", id), "custom_payments", `business:${id}:custom-payments`, `target_id=eq.${id}`);
  const bulk = useScopedWork(permissions.catalog, id, () => bulkService.pendingDepositsForBusiness(id), "bulk_deal_pledges", `business:${id}:bulk-deposits`);
  const questions = useScopedWork(permissions.leads, id, () => businessService.qna(id), "business_qna", `business:${id}:qna`, `business_id=eq.${id}`);

  const appts = appointments.data ?? [];
  const tokens: QueueOwnerToken[] = [...(queue.data?.waiting ?? []), ...(queue.data?.called ?? []), ...(queue.data?.served ?? [])];
  const money = deriveMoneySummary(appts, tokens, custom.data);
  const work = partitionDashboardWork(appts, money.appointmentClaims);
  const unanswered = (questions.data ?? []).filter((question) => !question.answer);
  const actionCount = countBusinessActions({
    bookings: work.pendingBookings.length, appointmentClaims: work.standaloneAppointmentClaims.length,
    customClaims: money.customClaims.length, queueClaims: money.queueClaims.length,
    questions: unanswered.length, bulkClaims: bulk.data?.length ?? 0,
  }, permissions);
  return {
    shop, status, appointments, queue, custom, bulk, questions, money, unanswered, actionCount,
    ...work,
    today: todaysAppointments(appts),
    upcoming: upcomingAppointments(appts),
    hasCurrentWork: appts.some(({ status }) => status === "PENDING" || status === "ACCEPTED"),
  };
}

export const BusinessConsoleDataContext = createContext<ReturnType<typeof useLoadBusinessConsoleData> | null>(null);

export function useBusinessConsoleData() {
  const data = useContext(BusinessConsoleDataContext);
  if (!data) throw new Error("Business console data is available inside BusinessManageLayout.");
  return data;
}
