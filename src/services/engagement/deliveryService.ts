import { getSupabase } from "@/lib/supabaseClient";
import { businessAccessService } from "@/services/marketplace/businessAccessService";
import { aliasName } from "@/lib/publicName";

/** A delivery-scoped team member the owner can dispatch a delivery to. */
export interface DeliveryTeamMember {
  userId: string;
  name: string;
  avatar?: string;
}

/** The delivery attached to an appointment (owner/customer view). */
export interface AppointmentDelivery {
  id: string;
  appointmentId: string;
  status: DeliveryStatus;
  liveStatus: DeliveryLiveStatus | null;
  handoffCode: string | null;
  handoffVerified: boolean;
  agentUserId: string | null;
  agentName: string;
  lat: number | null;
  lng: number | null;
}

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

  // ── Owner side ────────────────────────────────────────────────────────────

  /** The business's ACTIVE team members who carry the `delivery` scope. */
  async deliveryTeam(businessId: string): Promise<DeliveryTeamMember[]> {
    const sessions = await businessAccessService.ownerSessions(businessId);
    return sessions
      .filter((s) => s.status === "ACTIVE" && (s.scopes ?? []).includes("delivery") && s.granteeUserId)
      .map((s) => ({ userId: s.granteeUserId as string, name: s.granteeName, avatar: s.granteeAvatar }));
  },

  /** Owner/manager assigns (or reassigns) a delivery for an appointment. */
  async assignDelivery(appointmentId: string, agentUserId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("assign_delivery", {
      p_appointment_id: appointmentId,
      p_agent_user_id: agentUserId,
    });
    if (error) throw error;
  },

  /** Read the delivery for an appointment (owner + customer, RLS-scoped). */
  async forAppointment(appointmentId: string): Promise<AppointmentDelivery | null> {
    const sb = getSupabase();
    // Cast: appointment_deliveries isn't in the generated schema types yet
    // (new table — same typegen gap as the delivery RPCs).
    const { data } = await (sb as any)
      .from("appointment_deliveries")
      .select("id, appointment_id, status, live_status, handoff_code, handoff_verified, agent_user_id, lat, lng, agent:users!agent_user_id(alias, avatar)")
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const r = data as any;
    return {
      id: r.id,
      appointmentId: r.appointment_id,
      status: r.status,
      liveStatus: r.live_status ?? null,
      handoffCode: r.handoff_code ?? null,
      handoffVerified: !!r.handoff_verified,
      agentUserId: r.agent_user_id ?? null,
      agentName: aliasName({ alias: r.agent?.alias }, "Delivery agent"),
      lat: r.lat ?? null,
      lng: r.lng ?? null,
    };
  },
};
