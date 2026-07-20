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
  /** Structured cart line items (multi-item checkout / walk-in purchases) — additive to
   *  packageName/packagePrice, which stay the human-readable order summary. Only set on
   *  create() payloads that pass a real cart; a single-package booking omits this and the
   *  server synthesizes one implicit item for stock reservation. */
  items?: { catalogItemId: string; name: string; price: number; quantity: number }[];
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
