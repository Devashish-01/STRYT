import { getSupabase } from "@/lib/supabaseClient";

/** Live-status vocabulary an agent can push (mirrors the agreement flow). */
export type DeliveryLiveStatus = "LEAVING" | "ON_THE_WAY" | "ARRIVED" | "DONE";
/** Server-side lifecycle status of a delivery. */
export type DeliveryStatus = "ASSIGNED" | "EN_ROUTE" | "ARRIVED" | "DELIVERED" | "CANCELLED";

export interface DeliveryItem {
  id: string;
  appointmentId: string;
  businessId: string;
  businessName: string;
  /** Customer's real name while the delivery is active, alias once terminal. */
  customerName: string;
  customerArea: string | null;
  scheduledFor: string | null;
  dateLabel: string | null;
  timeLabel: string | null;
  status: DeliveryStatus;
  liveStatus: DeliveryLiveStatus | null;
  handoffCode: string | null;
  handoffVerified: boolean;
  lat: number | null;
  lng: number | null;
  createdAt: string | null;
  deliveredAt: string | null;
}

function rowToItem(r: any): DeliveryItem {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    businessId: r.business_id,
    businessName: r.business_name ?? "Business",
    customerName: r.customer_name ?? "Customer",
    customerArea: r.customer_area ?? null,
    scheduledFor: r.scheduled_for ?? null,
    dateLabel: r.date_label ?? null,
    timeLabel: r.time_label ?? null,
    status: r.status,
    liveStatus: r.live_status ?? null,
    handoffCode: r.handoff_code ?? null,
    handoffVerified: !!r.handoff_verified,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    createdAt: r.created_at ?? null,
    deliveredAt: r.delivered_at ?? null,
  };
}

export const deliveryService = {
  /** All deliveries assigned to the signed-in agent (active first). */
  async myDeliveries(): Promise<DeliveryItem[]> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("my_deliveries");
    if (error) throw error;
    return ((data ?? []) as any[]).map(rowToItem);
  },

  /** Agent pushes a live status (+ optional GPS). Server maps it to the
   *  lifecycle status and stamps delivered_at on DONE. */
  async updateStatus(deliveryId: string, status: DeliveryLiveStatus, lat?: number, lng?: number): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("appointment_update_delivery_status", {
      p_delivery_id: deliveryId,
      p_status: status,
      p_lat: lat ?? undefined,
      p_lng: lng ?? undefined,
    });
    if (error) throw error;
  },

  /** Verify the customer's handoff code; true when it matches. */
  async confirmHandoff(deliveryId: string, code: string): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("confirm_handoff", {
      p_delivery_id: deliveryId,
      p_code: code,
    });
    if (error) throw error;
    return data === true;
  },

  /** Create/reuse a public tracking token for the delivery's appointment. */
  async generateTrackingToken(appointmentId: string): Promise<string> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("appointment_create_tracking_token", {
      p_appointment_id: appointmentId,
    });
    if (error) throw error;
    return data as string;
  },
};
