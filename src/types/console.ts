// The appointment booking console — shared between the customer and the
// business/provider owner sides.

export type AppointmentStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type CancelledBy = "CUSTOMER" | "OWNER" | "SYSTEM";

export type PaymentMethod = "UPI" | "CASH";
export type PaymentStatus = "UNPAID" | "PENDING_CONFIRM" | "PAID" | "REJECTED";

export interface AppointmentRecord {
  id: string;
  targetId: string;
  targetName: string;
  targetAvatar?: string;
  targetType: "PROVIDER" | "BUSINESS";
  customerId: string;
  customerName: string;
  /** Customer's public alias — shown to the owner once the booking is finished (privacy model). */
  customerAlias?: string | null;
  customerAvatar?: string;
  scheduledForISO: string;
  dateLabel: string;
  timeLabel: string;
  notes?: string;
  photoUrl?: string;
  packageId?: string;
  packageName?: string;
  packagePrice?: number;
  status: AppointmentStatus;
  responseNote?: string;
  createdAtISO: string;
  paymentMethod?: PaymentMethod | null;
  paymentStatus?: PaymentStatus;
  paymentAmount?: number | null;
  paymentReference?: string | null;
  cancelledBy?: CancelledBy | null;
  isWalkIn?: boolean;
  /** Id of the appointment this one replaced, when created via the reschedule flow. */
  rescheduledFrom?: string | null;
  /** How the customer wants this fulfilled — visit the store, or delivered home. Defaults
   *  to IN_STORE for every booking made before this field existed. */
  fulfillmentType?: "IN_STORE" | "DELIVERY";
  /** Free-text delivery address (flat/street/landmark) — required alongside lat/lng when
   *  fulfillmentType is DELIVERY. Not a structured address; just enough for an agent to find the door. */
  deliveryAddressLine?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  /** How many spots this booking consumes in its slot (party size). Defaults to 1. */
  partySize?: number;
  /** Delivery window the CUSTOMER asked for at booking time (free text, e.g. "before 6pm"). */
  requestedDeliveryWindow?: string | null;
  /** ETA the BUSINESS confirmed when accepting (free text, e.g. "30-45 min"). Kept
   *  separate from requestedDeliveryWindow so the ask and the answer stay distinguishable. */
  deliveryEtaText?: string | null;
  /** Structured cart line items (multi-item checkout / walk-in purchases) — additive to
   *  packageName/packagePrice, which stay the human-readable order summary. Only set on
   *  create() payloads that pass a real cart; a single-package booking omits this and the
   *  server synthesizes one implicit item for stock reservation. */
  items?: { catalogItemId: string; name: string; price: number; quantity: number }[];
  /** Snapshot of the target's resolved Business Package at booking time — drives
   *  the wording ("reservation", "class"…) this row renders with in My Appointments,
   *  even if the business later changes package. Null for legacy rows and the QR
   *  self-pay walk-in path; renders as "generic" (today's exact wording). */
  targetPackageKey?: string | null;
}

// A customer paying a business/provider a self-chosen amount with no
// appointment/queue/deal relationship attached — see custom_payments table.
export interface CustomPayment {
  id: string;
  targetType: "BUSINESS" | "PROVIDER";
  targetId: string;
  targetOwnerUserId: string;
  targetName?: string | null;
  payerUserId: string;
  payerName?: string | null;
  payerAvatar?: string | null;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string | null;
  note?: string | null;
  createdAtISO: string;
  confirmedAtISO?: string | null;
}

export interface BlockedSlot {
  id: string;
  targetId: string;
  targetType: "PROVIDER" | "BUSINESS";
  date?: string | null;      // YYYY-MM-DD, set when !recurring
  weekday?: number | null;   // 0=Sun..6=Sat, set when recurring
  timeLabel?: string | null; // null = whole day blocked
  reason?: string | null;
  recurring: boolean;
  createdAtISO?: string;
}
