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
/** Server-side lifecycle status of a delivery run (batch). All-or-nothing accept lives here —
 *  there is no per-stop accept, only PENDING_ACCEPTANCE → ACCEPTED or DECLINED for the whole run. */
export type DeliveryBatchStatus = "PENDING_ACCEPTANCE" | "ACCEPTED" | "DECLINED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface DeliveryItem {
  id: string;
  appointmentId: string;
  businessId: string;
  businessName: string;
  /** Customer's real name while the delivery is active, alias once terminal. */
  customerName: string;
  customerArea: string | null;
  /** Free-text address captured at booking time — falls back to the customer's general area
   *  (customerArea) for pre-existing deliveries booked before this field existed. */
  deliveryAddressLine: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  scheduledFor: string | null;
  dateLabel: string | null;
  timeLabel: string | null;
  status: DeliveryStatus;
  liveStatus: DeliveryLiveStatus | null;
  handoffCode: string | null;
  handoffVerified: boolean;
  lat: number | null;
  lng: number | null;
  /** Null when this delivery isn't part of a batched run (assigned individually). */
  batchId: string | null;
  /** This stop's position within its batch's route — set once the agent accepts the run. */
  stopOrder: number | null;
  batchStatus: DeliveryBatchStatus | null;
  /** The agent's current live position for the whole run — lives on the batch, not the stop,
   *  since one agent has one position serving every stop in an active run. */
  batchLat: number | null;
  batchLng: number | null;
  createdAt: string | null;
  deliveredAt: string | null;
}

/** What the CUSTOMER is allowed to see about their delivery: progress, their
 *  own handoff code, and the agent's contact details only once the delivery is
 *  actually under way. Never any coordinates — live tracking is not offered to
 *  customers (deliberate product decision, enforced server-side). */
export interface CustomerDeliveryProgress {
  id: string;
  status: DeliveryStatus;
  liveStatus: DeliveryLiveStatus | null;
  handoffCode: string | null;
  handoffVerified: boolean;
  /** Null until `agentRevealed` is true. */
  agentName: string | null;
  agentPhone: string | null;
  agentAvatar: string | null;
  /** True once this delivery is EN_ROUTE or later. */
  agentRevealed: boolean;
  etaText: string | null;
  /** How many stops the agent has ahead of this one on the current run. */
  stopsBefore: number | null;
}

/** One delivery as the BUSINESS OWNER sees it — adds the agent's real identity
 *  (their own team member) on top of the customer-facing delivery shape. */
export interface BusinessDeliveryItem {
  id: string;
  appointmentId: string;
  status: DeliveryStatus;
  liveStatus: DeliveryLiveStatus | null;
  agentUserId: string | null;
  agentName: string;
  agentAvatar: string | null;
  agentPhone: string | null;
  customerName: string;
  deliveryAddressLine: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryEtaText: string | null;
  scheduledFor: string | null;
  dateLabel: string | null;
  timeLabel: string | null;
  batchId: string | null;
  stopOrder: number | null;
  batchStatus: DeliveryBatchStatus | null;
  batchLat: number | null;
  batchLng: number | null;
  batchHeading: number | null;
  handoffVerified: boolean;
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
    deliveryAddressLine: r.delivery_address_line ?? null,
    deliveryLat: r.delivery_lat ?? null,
    deliveryLng: r.delivery_lng ?? null,
    scheduledFor: r.scheduled_for ?? null,
    dateLabel: r.date_label ?? null,
    timeLabel: r.time_label ?? null,
    status: r.status,
    liveStatus: r.live_status ?? null,
    handoffCode: r.handoff_code ?? null,
    handoffVerified: !!r.handoff_verified,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    batchId: r.batch_id ?? null,
    stopOrder: r.stop_order ?? null,
    batchStatus: r.batch_status ?? null,
    batchLat: r.batch_lat ?? null,
    batchLng: r.batch_lng ?? null,
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

  /**
   * Customer-facing progress for their own delivery. Deliberately NOT a read
   * of appointment_deliveries: the customer gets status + their handoff code,
   * and the agent's name/phone/photo only once that delivery has actually
   * started. No coordinates are returned at any point — see
   * my_delivery_progress + the narrowed get_tracking.
   */
  async myProgress(appointmentId: string): Promise<CustomerDeliveryProgress | null> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("my_delivery_progress", { p_appointment_id: appointmentId });
    if (error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return null;
    return {
      id: r.id,
      status: r.status,
      liveStatus: r.live_status ?? null,
      handoffCode: r.handoff_code ?? null,
      handoffVerified: !!r.handoff_verified,
      agentName: r.agent_name ?? null,
      agentPhone: r.agent_phone ?? null,
      agentAvatar: r.agent_avatar ?? null,
      agentRevealed: !!r.agent_revealed,
      etaText: r.eta_text ?? null,
      stopsBefore: r.stops_before ?? null,
    };
  },

  /** Agent accepts the whole run at once, persisting the client-computed nearest-neighbor
   *  stop order in the same round trip. There is no per-stop accept — this is the only
   *  way any stop in the batch becomes workable. */
  async acceptBatch(batchId: string, stopOrder?: string[]): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("accept_delivery_batch", {
      p_batch_id: batchId,
      p_stop_order: stopOrder && stopOrder.length > 0 ? stopOrder : undefined,
    });
    if (error) throw error;
  },

  /** Agent declines the whole run — every stop is unassigned so the owner can reassign. */
  async declineBatch(batchId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("decline_delivery_batch", { p_batch_id: batchId });
    if (error) throw error;
  },

  /** Pure GPS push for the whole active run — separate from discrete stop-status changes,
   *  so a throttled background fix never has to pretend to be a status transition. */
  async updateBatchPosition(batchId: string, lat: number, lng: number, accuracy?: number, heading?: number): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("update_delivery_batch_position", {
      p_batch_id: batchId,
      p_lat: lat,
      p_lng: lng,
      p_accuracy: accuracy ?? undefined,
      p_heading: heading ?? undefined,
    });
    if (error) throw error;
  },

  /**
   * Owner/manager view of this business's deliveries — the business-scoped
   * mirror of myDeliveries(). Includes the assigned agent's real identity
   * (they're the owner's own team member) and the run's live position, so the
   * tracking page can follow progress per order and per agent.
   */
  async businessDeliveries(businessId: string): Promise<BusinessDeliveryItem[]> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("business_active_deliveries", { p_business_id: businessId });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      appointmentId: r.appointment_id,
      status: r.status,
      liveStatus: r.live_status ?? null,
      agentUserId: r.agent_user_id ?? null,
      agentName: r.agent_name ?? "Delivery agent",
      agentAvatar: r.agent_avatar ?? null,
      agentPhone: r.agent_phone ?? null,
      customerName: r.customer_name ?? "Customer",
      deliveryAddressLine: r.delivery_address_line ?? null,
      deliveryLat: r.delivery_lat ?? null,
      deliveryLng: r.delivery_lng ?? null,
      deliveryEtaText: r.delivery_eta_text ?? null,
      scheduledFor: r.scheduled_for ?? null,
      dateLabel: r.date_label ?? null,
      timeLabel: r.time_label ?? null,
      batchId: r.batch_id ?? null,
      stopOrder: r.stop_order ?? null,
      batchStatus: r.batch_status ?? null,
      batchLat: r.batch_lat ?? null,
      batchLng: r.batch_lng ?? null,
      batchHeading: r.batch_heading ?? null,
      handoffVerified: !!r.handoff_verified,
      createdAt: r.created_at ?? null,
      deliveredAt: r.delivered_at ?? null,
    }));
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

  /** Owner/manager assigns N eligible appointments to one agent in a single run — the agent
   *  must accept the whole batch or decline it, there's no per-stop assignment here. */
  async assignBatch(appointmentIds: string[], agentUserId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("assign_delivery_batch", {
      p_appointment_ids: appointmentIds,
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
