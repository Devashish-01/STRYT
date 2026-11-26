import { createContext, useContext } from "react";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { appointmentService } from "@/services/engagement/appointmentService";
import type { AppointmentRecord } from "@/types";

export function useLoadProviderAppointments(id: string) {
  return useQueryWithRealtime(
    () => appointmentService.listForTarget(id),
    "appointments", [id], `target_id=eq.${id}`, `provider:${id}:appointments-owner`,
  );
}

export const ProviderAppointmentsContext = createContext<ReturnType<typeof useLoadProviderAppointments> | null>(null);

export function useProviderAppointments() {
  const appointments = useContext(ProviderAppointmentsContext);
  if (!appointments) throw new Error("Provider appointments require a Provider manage route.");
  return appointments;
}

export function summarizeProviderActions(appointments: readonly AppointmentRecord[], unhandledLeads: number) {
  const pending = appointments.filter((item) => item.status === "PENDING")
    .sort((a, b) => new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime());
  const claims = appointments.filter((item) => item.paymentStatus === "PENDING_CONFIRM");
  return { pending, claims, total: pending.length + claims.length + unhandledLeads };
}
