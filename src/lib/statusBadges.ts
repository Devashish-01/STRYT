// One status→color vocabulary shared across the request/quote/agreement
// pipeline, so a request's card, its detail page, a "Sent" proposal list,
// and the agreements list never disagree about what a status means visually.
import type { RequestStatus, ProposalStatus, AgreementStatus, AppointmentStatus } from "@/types";

export interface StatusBadge {
  label: string;
  cls: string;
}

// OPEN has no badge (every card is "live" by default) — makes the lifecycle
// states (agreed/completed/cancelled/expired) the only ones that stand out.
export const REQUEST_STATUS_BADGE: Record<RequestStatus, StatusBadge | null> = {
  OPEN: null,
  AGREED: { label: "In progress", cls: "badge-blue" },
  IN_PROGRESS: { label: "In progress", cls: "badge-blue" },
  COMPLETED: { label: "Completed", cls: "badge-green" },
  CANCELLED: { label: "Cancelled", cls: "badge-gray" },
  EXPIRED: { label: "Expired", cls: "badge-gray" },
};

export const PROPOSAL_STATUS_BADGE: Record<ProposalStatus, StatusBadge> = {
  SUBMITTED: { label: "Sent", cls: "badge-blue" },
  ACCEPTED: { label: "Accepted", cls: "badge-green" },
  REJECTED: { label: "Not selected", cls: "badge-gray" },
  WITHDRAWN: { label: "Withdrawn", cls: "badge-gray" },
};

export const AGREEMENT_STATUS_BADGE: Record<AgreementStatus, StatusBadge> = {
  PENDING: { label: "Awaiting confirmation", cls: "badge-amber" },
  ACTIVE: { label: "Active", cls: "badge-blue" },
  DEPOSIT_PAID: { label: "Deposit paid", cls: "badge-blue" },
  IN_PROGRESS: { label: "In progress", cls: "badge-blue" },
  REVIEW: { label: "Under review", cls: "badge-amber" },
  COMPLETED: { label: "Completed", cls: "badge-green" },
  CANCELLED: { label: "Cancelled", cls: "badge-gray" },
  DISPUTED: { label: "Disputed", cls: "badge-red" },
};

// Previously reinvented per-screen (customer/business/provider), and disagreed:
// NO_SHOW was gray on the customer screen but red on both owner screens, and
// ACCEPTED only got a friendly "CONFIRMED" label on the customer screen while
// owner screens rendered the raw enum (including a literal "NO_SHOW").
export const APPOINTMENT_STATUS_BADGE: Record<AppointmentStatus, StatusBadge> = {
  PENDING: { label: "Pending", cls: "badge-purple" },
  ACCEPTED: { label: "Confirmed", cls: "badge-green" },
  REJECTED: { label: "Declined", cls: "badge-gray" },
  COMPLETED: { label: "Completed", cls: "badge-green" },
  CANCELLED: { label: "Cancelled", cls: "badge-gray" },
  NO_SHOW: { label: "No-show", cls: "badge-red" },
};
