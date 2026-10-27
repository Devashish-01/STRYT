import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { businessAccessService } from "@/services/marketplace/businessAccessService";
import { aliasName } from "@/lib/publicName";
// Delivery lifecycle events (assigned, picked up, en route, arrived, delivered, failed, packed, cash) are emitted by
// triggers in 20261009_analytics_v1.sql. Only a rider's decline — which leaves no clean row change — is sent from here.
import { EVENTS, track } from "@/lib/analytics";
import { toApiError } from "@/lib/supabasePage";

/** The server's delivery refusal codes, in words an owner or rider can act on. Anything unrecognised is thrown untouched. */
export function friendlyDeliveryError(e: unknown): unknown {
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  const map: [RegExp, string][] = [
    [/NOT_A_DELIVERY_ORDER/, "That order isn't a home delivery."],
    [/ORDER_NOT_ACCEPTED/, "This order isn't open for delivery — it may be finished, cancelled, or not accepted yet. Refresh the list."],
    [/ORDER_NOT_READY/, "The shop hasn't marked this order packed yet."],
    [/ORDER_NOT_ACTIVE/, "This order was cancelled or closed — stop the delivery."],
    [/SOME_APPOINTMENTS_NOT_ELIGIBLE/, "Some of the selected orders can't join a run — they may already be assigned, cancelled or not accepted yet. Refresh and try again."],
    [/AGENT_NOT_TEAM_MEMBER/, "That person is no longer on your team."],
    [/appointment_deliveries_one_active|duplicate key/i, "That order was just assigned to someone else. Refresh to see the latest."],
    [/NOT_PICKED_UP/, "Confirm pick-up from the shop first."],
    [/INVALID_STOP_ORDER/, "The route couldn't be saved. Please try again."],
    [/BATCH_NOT_ACCEPTED/, "Accept the run before starting its stops."],
    [/PROOF_NOT_ALLOWED/, "This shop doesn't allow leaving orders at the door."],
    [/PROOF_REQUIRES_PREPAID/, "Only prepaid orders can be left at the door — this one still has money to collect."],
    [/PROOF_TOO_EARLY/, "Wait a few more minutes for the customer before leaving the order."],
    [/INVALID_PROOF_PHOTO/, "That photo couldn't be used. Take it again."],
    [/ALREADY_HANDED_OFF/, "The customer already gave the code — just complete the delivery."],
  ];
  for (const [re, text] of map) if (re.test(msg)) return new Error(text);
  return e;
}

/** Where a delivery stands on leave-at-the-door proof. The photo is only present for the rider, or once delivered. */
export interface DeliveryProofInfo {
  allowed: boolean;
  canRecord: boolean;
  waitedMin: number | null;
  photoUrl: string | null;
  note: string | null;
  at: string | null;
}

/** A delivery-scoped team member the owner can dispatch a delivery to. */
/** A delivered order that is still unpaid. */
export interface CashOutstanding {
  appointmentId: string;
  customerName: string;
  amount: number;
  deliveredAt: string | null;
  agentName: string;
}

export interface AdminDeliveryOverview {
  active: number;
  delivered7d: number;
  failed7d: number;
  awaitingRider: number;
  cashOutstanding: number;
  cashUnsettled: number;
  attention: { deliveryId: string; appointmentId: string; businessId: string; businessName: string; status: string; issue: string; since: string | null }[];
}

export interface DeliveryTeamMember {
  userId: string;
  name: string;
  avatar?: string;
  /** Informational only — an off-duty agent can still be assigned (there's no
   *  auto-dispatch anywhere in this app to gate), it just shows a tag in the
   *  picker so the owner isn't surprised when nobody responds right away. */
  onDuty: boolean;
  /** The signed-in owner, offered so a one-person shop can deliver its own orders without inviting itself. */
  isSelf?: boolean;
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
/**
 * Why a delivery couldn't be completed. Mirrors the CHECK constraint in
 * `20260872_delivery_cancellation.sql` — keep the two in step, the server
 * rejects anything outside this list.
 */
export type CancelReason =
  | "CUSTOMER_UNAVAILABLE"
  | "ADDRESS_PROBLEM"
  | "CUSTOMER_REFUSED"
  | "UNSAFE"
  | "AGENT_EMERGENCY"
  | "OTHER";

/** Why the off-duty toggle is blocked, so the UI can say so before it's tapped. */
export interface DutyBlockers {
  count: number;
  deliveryId: string | null;
  batchId: string | null;
}
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
  /** Cash the rider still has to collect (0 once paid). Whole rupees as a number. */
  amountDue: number;
  deliveryFee: number;
  paymentMethod: string | null;
  paymentStatus: string | null;
  cashCollectedAt: string | null;
  /** The customer's number — only present once the rider is on the way to them. */
  customerPhone: string | null;
  businessPhone: string | null;
  /** What the customer wrote on the order, and the window they asked for. */
  orderNotes: string | null;
  requestedWindow: string | null;
  packageName: string | null;
  /** What to pick up and hand over. */
  items: { name: string; quantity: number }[];
  /** When the rider confirmed pick-up from the shop; null until they have (the delivery cannot start before). */
  pickedUpAt: string | null;
  /** When the shop marked the order packed. null = not packed yet; undefined = the database predates this column, so don't gate on it. */
  orderReadyAt?: string | null;
  /** The rider is the shop's owner: they packed it themselves, so there is no waiting for the shop. */
  isOwnerDelivery?: boolean;
  businessLat: number | null;
  businessLng: number | null;
  businessAddress: string | null;
}

/** An order waiting for a rider — accepted, delivery, nobody assigned yet. */
export interface AwaitingDriverOrder {
  appointmentId: string;
  customerName: string;
  deliveryAddressLine: string | null;
  scheduledFor: string | null;
  timeLabel: string | null;
  isAsap: boolean;
  packageName: string | null;
  packagePrice: number | null;
  deliveryFee: number;
  readyAt: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  isOutOfRange: boolean;
  createdAt: string | null;
}

/** Cash a rider has collected and not yet handed to the shop. */
export interface CashToSettle {
  agentUserId: string;
  agentName: string;
  orders: number;
  amount: number;
  oldest: string | null;
}

export interface DeliveryStats {
  days: number;
  delivered: number;
  cancelled: number;
  avgMinutes: number | null;
  feesCollected: number;
  perAgent: { agentUserId: string; name: string; delivered: number }[];
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
  cancelReason?: CancelReason | null;
  cancelNote?: string | null;
  /** Minutes away, computed on the server from a fresh rider position (null when unknown). No coordinates are sent. */
  etaMinutes?: number | null;
  businessPhone?: string | null;
  /** The rider has collected the order from the shop. */
  pickedUp?: boolean;
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
  /** The agent's current live position — a batch's shared run position, or
   *  (as of the agent-position fix) a solo delivery's own tracked point. */
  agentLat: number | null;
  agentLng: number | null;
  agentHeading: number | null;
  handoffVerified: boolean;
  createdAt: string | null;
  deliveredAt: string | null;
  /** When the agent's position was last written; null before the first fix. Old = lost, not "live". */
  positionAt: string | null;
  pickedUpAt: string | null;
  startedAt: string | null;
  arrivedAt: string | null;
  cancelReason: CancelReason | null;
  cancelNote: string | null;
  cancelledBy: "AGENT" | "BUSINESS" | "SYSTEM" | null;
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
    batchStatus: (r.batch_status ?? null) as DeliveryBatchStatus | null,
    batchLat: r.batch_lat ?? null,
    batchLng: r.batch_lng ?? null,
    createdAt: r.created_at ?? null,
    deliveredAt: r.delivered_at ?? null,
    amountDue: Number(r.amount_due ?? 0),
    deliveryFee: Number(r.delivery_fee ?? 0),
    paymentMethod: r.payment_method ?? null,
    paymentStatus: r.payment_status ?? null,
    cashCollectedAt: r.cash_collected_at ?? null,
    customerPhone: r.customer_phone ?? null,
    businessPhone: r.business_phone ?? null,
    orderNotes: r.order_notes ?? null,
    requestedWindow: r.requested_window ?? null,
    packageName: r.package_name ?? null,
    items: Array.isArray(r.items) ? r.items.map((i: any) => ({ name: String(i.name ?? "Item"), quantity: Number(i.quantity ?? 1) })) : [],
    pickedUpAt: r.picked_up_at ?? null,
    orderReadyAt: "order_ready_at" in r ? (r.order_ready_at ?? null) : undefined,
    isOwnerDelivery: "is_owner_delivery" in r ? !!r.is_owner_delivery : undefined,
    businessLat: r.business_lat ?? null,
    businessLng: r.business_lng ?? null,
    businessAddress: r.business_address ?? null,
  };
}

export const deliveryService = {
  /** Count non-terminal deliveries assigned to the signed-in user. */
  async countMyActiveDeliveries(businessId?: string): Promise<number> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("count_my_active_deliveries", {
      p_business_id: businessId ?? undefined,
    });
    if (error) throw toApiError(error);
    return typeof data === "number" ? data : Number(data ?? 0);
  },

  /** All deliveries assigned to the signed-in agent (active first). */
  async myDeliveries(): Promise<DeliveryItem[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("my_deliveries");
    if (error) throw toApiError(error);
    return (data ?? []).map(rowToItem);
  },

  /** Agent pushes a live status (+ optional GPS). Server maps it to the
   *  lifecycle status and stamps delivered_at on DONE. */
  async updateStatus(deliveryId: string, status: DeliveryLiveStatus, lat?: number, lng?: number): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("appointment_update_delivery_status", {
      p_delivery_id: deliveryId,
      p_status: status,
      p_lat: lat ?? undefined,
      p_lng: lng ?? undefined,
    });
    if (error) throw friendlyDeliveryError(toApiError(error));
  },

  /** Rider confirms they have the order from the shop. A run is picked up once, for every stop on it. */
  async markPickedUp(deliveryId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("delivery_mark_picked_up" as any, { p_delivery_id: deliveryId });
    if (error) throw friendlyDeliveryError(toApiError(error));
  },

  /**
   * Leave-at-the-door proof (shops that allow it, prepaid orders, after waiting five minutes). Records the photo; the ordinary
   * "delivered" step then accepts it in place of the customer's code.
   */
  async recordProof(deliveryId: string, photoUrl: string, note?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("delivery_record_proof" as any, { p_delivery_id: deliveryId, p_photo_url: photoUrl, p_note: note?.trim() || null });
    if (error) throw friendlyDeliveryError(toApiError(error));
  },

  /** What the proof screens need: whether the shop allows it, whether the rider can record it now, and (once delivered) the photo. */
  async proofInfo(deliveryId: string): Promise<DeliveryProofInfo> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("delivery_proof" as any, { p_delivery_id: deliveryId });
    if (error) throw toApiError(error);
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, any> | null;
    return {
      allowed: !!r?.proof_allowed,
      canRecord: !!r?.can_record,
      waitedMin: r?.waited_min == null ? null : Number(r.waited_min),
      photoUrl: r?.proof_photo_url ?? null,
      note: r?.proof_note ?? null,
      at: r?.proof_at ?? null,
    };
  },

  /** After a failed attempt the customer caused: "I'm available now — send a rider again". Returns false if throttled. */
  async readyForRedelivery(appointmentId: string): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("customer_ready_for_redelivery" as any, { p_appointment_id: appointmentId });
    if (error) throw toApiError(error);
    return data !== false;
  },

  /** Delivered orders that are still unpaid — money the shop has to chase. */
  async cashOutstanding(businessId: string): Promise<CashOutstanding[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("business_cash_outstanding" as any, { p_business_id: businessId });
    if (error) throw toApiError(error);
    return ((data ?? []) as any[]).map((r) => ({
      appointmentId: r.appointment_id,
      customerName: r.customer_name ?? "Customer",
      amount: Number(r.amount ?? 0),
      deliveredAt: r.delivered_at ?? null,
      agentName: r.agent_name ?? "Rider",
    }));
  },

  async markOutstandingPaid(appointmentId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("mark_outstanding_paid" as any, { p_appointment_id: appointmentId });
    if (error) throw toApiError(error);
  },

  /** Admin only: counts and the deliveries that need a human. */
  async adminOverview(): Promise<AdminDeliveryOverview> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("admin_delivery_overview" as any);
    if (error) throw toApiError(error);
    const d: any = data ?? {};
    return {
      active: Number(d.active ?? 0),
      delivered7d: Number(d.delivered_7d ?? 0),
      failed7d: Number(d.failed_7d ?? 0),
      awaitingRider: Number(d.awaiting_rider ?? 0),
      cashOutstanding: Number(d.cash_outstanding ?? 0),
      cashUnsettled: Number(d.cash_unsettled ?? 0),
      attention: ((d.attention ?? []) as any[]).map((a) => ({
        deliveryId: a.delivery_id, appointmentId: a.appointment_id, businessId: a.business_id,
        businessName: a.business_name ?? "Business", status: a.status, issue: a.issue, since: a.since ?? null,
      })),
    };
  },

  /** Several appointments' latest delivery in one query — the dispatch list used to fire one query per card. */
  async forAppointments(appointmentIds: string[]): Promise<Record<string, AppointmentDelivery>> {
    if (appointmentIds.length === 0) return {};
    const sb = getSupabase();
    const { data } = await (sb as any)
      .from("appointment_deliveries")
      .select("id, appointment_id, status, live_status, handoff_verified, agent_user_id, lat, lng, created_at, agent:users!agent_user_id(alias, avatar)")
      .in("appointment_id", appointmentIds)
      .order("created_at", { ascending: false });
    const out: Record<string, AppointmentDelivery> = {};
    for (const r of (data ?? []) as any[]) {
      if (out[r.appointment_id]) continue; // newest first, so the first one seen is the latest
      out[r.appointment_id] = {
        id: r.id, appointmentId: r.appointment_id, status: r.status, liveStatus: r.live_status ?? null, handoffCode: null,
        handoffVerified: !!r.handoff_verified, agentUserId: r.agent_user_id ?? null,
        agentName: aliasName({ alias: r.agent?.alias }, "Delivery agent"), lat: r.lat ?? null, lng: r.lng ?? null,
      };
    }
    return out;
  },

  /**
   * Mark a delivery undeliverable. Callable by the assigned agent or by
   * owner/manager. The APPOINTMENT is deliberately untouched — the customer
   * keeps their order, it simply has no live delivery until someone is
   * dispatched again (see DLV-001 / decision D2).
   */
  async cancelDelivery(deliveryId: string, reason: CancelReason, note?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("cancel_delivery", {
      p_delivery_id: deliveryId,
      p_reason: reason,
      p_note: note?.trim() || undefined,
    });
    if (error) throw toApiError(error);
  },

  /**
   * What's stopping this agent going off duty, read BEFORE they tap rather
   * than discovered by tapping. `set_delivery_duty` still raises on its own —
   * this is the proactive read that lets the toggle disable itself with a
   * reason instead of punishing the tap.
   */
  async dutyBlockers(): Promise<DutyBlockers> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("my_duty_blockers");
    if (error) throw toApiError(error);
    const r = Array.isArray(data) ? data[0] : data;
    return {
      count: Number(r?.blocking_count ?? 0),
      deliveryId: r?.blocking_delivery_id ?? null,
      batchId: r?.blocking_batch_id ?? null,
    };
  },

  /** Verify the customer's handoff code; true when it matches. */
  async confirmHandoff(deliveryId: string, code: string): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("confirm_handoff", {
      p_delivery_id: deliveryId,
      p_code: code,
    });
    if (error) throw toApiError(error);
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
    const { data, error } = await sb.rpc("my_delivery_progress", { p_appointment_id: appointmentId });
    if (error) throw toApiError(error);
    // Cast: the columns added in 20261003 are not in the generated types until they are regenerated.
    const r: any = Array.isArray(data) ? data[0] : data;
    if (!r) return null;
    return {
      id: r.id,
      // status / live_status / cancel_reason are text columns with CHECK constraints listing exactly
      // the members of these unions (20260845, 20260872), so the RPC's `text` cannot hold anything else.
      status: r.status as DeliveryStatus,
      liveStatus: (r.live_status ?? null) as DeliveryLiveStatus | null,
      handoffCode: r.handoff_code ?? null,
      handoffVerified: !!r.handoff_verified,
      agentName: r.agent_name ?? null,
      agentPhone: r.agent_phone ?? null,
      agentAvatar: r.agent_avatar ?? null,
      agentRevealed: !!r.agent_revealed,
      etaText: r.eta_text ?? null,
      stopsBefore: r.stops_before ?? null,
      cancelReason: (r.cancel_reason ?? null) as CancelReason | null,
      cancelNote: r.cancel_note ?? null,
      etaMinutes: r.eta_minutes == null ? null : Number(r.eta_minutes),
      businessPhone: r.business_phone ?? null,
      pickedUp: !!r.picked_up,
    };
  },

  /**
   * Generate (or fetch active) shareable 4-hour tracking token for an appointment.
   * Can be called by the customer, merchant, or assigned agent.
   */
  async createTrackingToken(appointmentId: string): Promise<string> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("appointment_create_tracking_token", {
      p_appointment_id: appointmentId,
    });
    if (error) throw toApiError(error);
    return String(data);
  },

  /** Agent accepts the whole run at once, persisting the client-computed nearest-neighbor
   *  stop order in the same round trip. There is no per-stop accept — this is the only
   *  way any stop in the batch becomes workable. */
  async acceptBatch(batchId: string, stopOrder?: string[]): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("accept_delivery_batch", {
      p_batch_id: batchId,
      p_stop_order: stopOrder && stopOrder.length > 0 ? stopOrder : undefined,
    });
    if (error) throw friendlyDeliveryError(toApiError(error));
  },

  /** Agent declines the whole run — every stop is unassigned so the owner can reassign. `businessId`, when the caller
   *  knows it, attributes the decline to the shop in analytics. */
  async declineBatch(batchId: string, businessId?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("decline_delivery_batch", { p_batch_id: batchId });
    if (error) throw toApiError(error);
    track(EVENTS.DELIVERY_DECLINED, { assignment_type: "run" }, businessId ? { type: "business", id: businessId } : undefined);
  },

  /**
   * Pure GPS push for one SOLO delivery — the single-stop twin of
   * updateBatchPosition. Writes coordinates only, never status: pushing
   * position through `updateStatus(..., "ON_THE_WAY")` (what this replaced)
   * could drag an ARRIVED delivery back to EN_ROUTE when a background fix
   * landed just after the agent tapped Arrived. See DLV-003.
   *
   * Silently no-ops server-side for a terminal delivery, so a late fix from a
   * backgrounded app can't resurrect anything.
   */
  async updatePosition(deliveryId: string, lat: number, lng: number, accuracy?: number, heading?: number): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("update_delivery_position", {
      p_delivery_id: deliveryId,
      p_lat: lat,
      p_lng: lng,
      p_accuracy: accuracy ?? undefined,
      p_heading: heading ?? undefined,
    });
    if (error) throw toApiError(error);
  },

  /** Pure GPS push for the whole active run — separate from discrete stop-status changes,
   *  so a throttled background fix never has to pretend to be a status transition. */
  async updateBatchPosition(batchId: string, lat: number, lng: number, accuracy?: number, heading?: number): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("update_delivery_batch_position", {
      p_batch_id: batchId,
      p_lat: lat,
      p_lng: lng,
      p_accuracy: accuracy ?? undefined,
      p_heading: heading ?? undefined,
    });
    if (error) throw toApiError(error);
  },

  /**
   * Owner/manager view of this business's deliveries — the business-scoped
   * mirror of myDeliveries(). Includes the assigned agent's real identity
   * (they're the owner's own team member) and the run's live position, so the
   * tracking page can follow progress per order and per agent.
   */
  async businessDeliveries(businessId: string): Promise<BusinessDeliveryItem[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("business_active_deliveries", { p_business_id: businessId });
    if (error) throw toApiError(error);
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      appointmentId: r.appointment_id,
      // appointment_deliveries_status_check and _live_status_check constrain both columns to exactly the
      // members of these unions.
      status: r.status as DeliveryStatus,
      liveStatus: (r.live_status ?? null) as DeliveryLiveStatus | null,
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
      batchStatus: (r.batch_status ?? null) as DeliveryBatchStatus | null,
      agentLat: r.agent_lat ?? null,
      agentLng: r.agent_lng ?? null,
      agentHeading: r.agent_heading ?? null,
      handoffVerified: !!r.handoff_verified,
      createdAt: r.created_at ?? null,
      deliveredAt: r.delivered_at ?? null,
      positionAt: r.position_at ?? null,
      pickedUpAt: r.picked_up_at ?? null,
      startedAt: r.started_at ?? null,
      arrivedAt: r.arrived_at ?? null,
      cancelReason: (r.cancel_reason ?? null) as CancelReason | null,
      cancelNote: r.cancel_note ?? null,
      cancelledBy: (r.cancelled_by ?? null) as "AGENT" | "BUSINESS" | "SYSTEM" | null,
    }));
  },

  // ── Owner side ────────────────────────────────────────────────────────────

  /** The business's ACTIVE team members — any grantee may be assigned a delivery. */
  async deliveryTeam(businessId: string): Promise<DeliveryTeamMember[]> {
    const sessions = await businessAccessService.ownerSessions(businessId);
    const members: { userId: string; name: string; avatar?: string; isSelf?: boolean }[] = sessions
      .filter((s) => s.status === "ACTIVE" && s.granteeUserId)
      .map((s) => ({ userId: s.granteeUserId as string, name: s.granteeName, avatar: s.granteeAvatar }));

    // A one-person shop delivers its own orders. assign_delivery already accepts the owner as the agent
    // (has_business_access includes the owner); the list just never offered them.
    try {
      const me = await currentUserId();
      const { data: biz } = await getSupabase().from("businesses").select("owner_user_id").eq("id", businessId).maybeSingle();
      if (me && biz?.owner_user_id === me && !members.some((m) => m.userId === me)) {
        members.unshift({ userId: me, name: "Me", isSelf: true });
      }
    } catch { /* offer the team as before */ }
    if (members.length === 0) return [];

    // Duty is informational only here (no auto-dispatch to gate) — best-effort,
    // defaults every member to on-duty if the lookup fails rather than hiding
    // the assign option behind a transient error.
    const sb = getSupabase();
    try {
      const { data } = await (sb as any)
        .from("delivery_agent_duty")
        .select("user_id, on_duty")
        .in("user_id", members.map((m) => m.userId));
      const duty = new Map<string, boolean>((data ?? []).map((r: any) => [r.user_id, r.on_duty !== false]));
      return members.map((m) => ({ ...m, onDuty: duty.get(m.userId) ?? true }));
    } catch {
      return members.map((m) => ({ ...m, onDuty: true }));
    }
  },

  /** Rider turns down a single (non-run) assignment that hasn't started; the order returns to the dispatch list.
   *  `businessId`, when the caller knows it, attributes the decline to the shop in analytics. */
  async declineSolo(deliveryId: string, businessId?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("decline_solo_delivery" as any, { p_delivery_id: deliveryId });
    if (error) throw toApiError(error);
    track(EVENTS.DELIVERY_DECLINED, { assignment_type: "single", delivery_id: deliveryId },
      businessId ? { type: "business", id: businessId } : undefined);
  },

  /** Orders accepted for delivery that no rider has been assigned to yet — the dispatch board. */
  async awaitingDriver(businessId: string): Promise<AwaitingDriverOrder[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("business_delivery_queue" as any, { p_business_id: businessId });
    if (error) throw toApiError(error);
    return ((data ?? []) as any[]).map((r) => ({
      appointmentId: r.appointment_id,
      customerName: r.customer_name ?? "Customer",
      deliveryAddressLine: r.delivery_address_line ?? null,
      scheduledFor: r.scheduled_for ?? null,
      timeLabel: r.time_label ?? null,
      isAsap: !!r.is_asap,
      packageName: r.package_name ?? null,
      packagePrice: r.package_price == null ? null : Number(r.package_price),
      deliveryFee: Number(r.delivery_fee ?? 0),
      readyAt: r.ready_at ?? null,
      paymentMethod: r.payment_method ?? null,
      paymentStatus: r.payment_status ?? null,
      isOutOfRange: !!r.is_out_of_range,
      createdAt: r.created_at ?? null,
    }));
  },

  /** Shop marks an accepted order packed / ready; the customer is told. Idempotent. */
  async markOrderReady(appointmentId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("mark_order_ready" as any, { p_appointment_id: appointmentId });
    if (error) throw toApiError(error);
  },

  /** Rider records the cash taken at the door. Returns the amount. */
  async collectCash(deliveryId: string): Promise<number> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("delivery_collect_cash" as any, { p_delivery_id: deliveryId });
    if (error) throw toApiError(error);
    return Number(data ?? 0);
  },

  /** Cash riders are holding that the shop hasn't taken yet, per rider. */
  async cashToSettle(businessId: string): Promise<CashToSettle[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("business_cash_to_settle" as any, { p_business_id: businessId });
    if (error) throw toApiError(error);
    return ((data ?? []) as any[]).map((r) => ({
      agentUserId: r.agent_user_id,
      agentName: r.agent_name ?? "Rider",
      orders: Number(r.orders ?? 0),
      amount: Number(r.amount ?? 0),
      oldest: r.oldest ?? null,
    }));
  },

  /** The shop has received the cash a rider collected. Returns the amount settled. */
  async settleCash(businessId: string, agentUserId: string): Promise<number> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("settle_agent_cash" as any, { p_business_id: businessId, p_agent_user_id: agentUserId });
    if (error) throw toApiError(error);
    return Number(data ?? 0);
  },

  async stats(businessId: string, days = 30): Promise<DeliveryStats> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("business_delivery_stats" as any, { p_business_id: businessId, p_days: days });
    if (error) throw toApiError(error);
    const d: any = data ?? {};
    return {
      days: Number(d.days ?? days),
      delivered: Number(d.delivered ?? 0),
      cancelled: Number(d.cancelled ?? 0),
      avgMinutes: d.avg_minutes == null ? null : Number(d.avg_minutes),
      feesCollected: Number(d.fees_collected ?? 0),
      perAgent: ((d.per_agent ?? []) as any[]).map((a) => ({ agentUserId: a.agent_user_id, name: a.name ?? "Rider", delivered: Number(a.delivered ?? 0) })),
    };
  },

  /** The signed-in agent's own duty status. */
  async myDutyStatus(): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("get_delivery_duty");
    if (error) throw toApiError(error);
    return data !== false;
  },

  /** Sets the signed-in agent's duty status. Rejects (server-side) if they
   *  have any non-terminal delivery work when going off duty. */
  async setDuty(onDuty: boolean): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("set_delivery_duty", { p_on_duty: onDuty });
    if (error) throw toApiError(error);
  },

  /** Owner/manager assigns (or reassigns) a delivery for an appointment. */
  async assignDelivery(appointmentId: string, agentUserId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("assign_delivery", {
      p_appointment_id: appointmentId,
      p_agent_user_id: agentUserId,
    });
    if (error) throw friendlyDeliveryError(toApiError(error));
  },

  /** Owner/manager assigns N eligible appointments to one agent in a single run — the agent
   *  must accept the whole batch or decline it, there's no per-stop assignment here. */
  async assignBatch(appointmentIds: string[], agentUserId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("assign_delivery_batch", {
      p_appointment_ids: appointmentIds,
      p_agent_user_id: agentUserId,
    });
    if (error) throw friendlyDeliveryError(toApiError(error));
  },

  /** Read the delivery for an appointment (owner + customer, RLS-scoped). */
  async forAppointment(appointmentId: string): Promise<AppointmentDelivery | null> {
    const sb = getSupabase();
    // Cast: appointment_deliveries isn't in the generated schema types yet
    // (new table — same typegen gap as the delivery RPCs).
    const { data } = await (sb as any)
      .from("appointment_deliveries")
      .select("id, appointment_id, status, live_status, handoff_verified, agent_user_id, lat, lng, agent:users!agent_user_id(alias, avatar)")
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
      handoffCode: null,
      handoffVerified: !!r.handoff_verified,
      agentUserId: r.agent_user_id ?? null,
      agentName: aliasName({ alias: r.agent?.alias }, "Delivery agent"),
      lat: r.lat ?? null,
      lng: r.lng ?? null,
    };
  },
};
