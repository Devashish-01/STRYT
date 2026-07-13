// Service requests, proposals, and the agreements they turn into.

export type RequestStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "AGREED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export type JobLiveStatus =
  | "CONFIRMED"
  | "LEAVING"
  | "ON_THE_WAY"
  | "ARRIVED"
  | "WORKING"
  | "DONE";

export interface RequestPost {
  id: string;
  requesterUserId: string;
  requesterName: string;
  requesterAvatar: string;
  requesterRating: number;
  title: string;
  description: string;
  categoryId: string | null;
  categoryName: string;
  subCategory?: string;
  budgetMin?: number;
  budgetMax?: number;
  area: string;
  lat?: number;
  lng?: number;
  distanceKm: number;
  radiusKm: number;
  deadline: string;
  postedAt: string; // relative label
  status: RequestStatus;
  isBoosted: boolean;
  viewCount: number;
  photos: string[];
  proposals: Proposal[];
  // social additions
  meTooCount?: number;
  meTooed?: boolean;
  isGroupBuy?: boolean;
  groupBuyTarget?: number;
  isUrgent?: boolean;
  isRecurring?: boolean;
  isAnonymous?: boolean;
  expiresInHrs?: number;
  expiresAt?: string | null; // ISO; request auto-EXPIREs past this (max 24h out)
  liveStatus?: JobLiveStatus;
}

export type ProposalStatus = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

export interface ProposalCounter {
  id: string;
  by: "requester" | "responder";
  amount: number;
  message: string;
  time: string;
}

export interface Proposal {
  id: string;
  requestId: string;
  responderUserId: string;
  responderName: string;
  responderAvatar: string;
  responderRating: number;
  responderType: "provider" | "business" | "user";
  /** The business/provider id this proposal was submitted under, when responderType isn't "user". */
  responderEntityId?: string;
  responderTagline: string;
  price: number;
  message: string;
  eta: string;
  status: ProposalStatus;
  isBoosted: boolean;
  broadcastToMetoo?: boolean;
  postedAt: string;
  counters?: ProposalCounter[];
}

export type AgreementStatus =
  | "PENDING"
  | "ACTIVE"
  | "DEPOSIT_PAID"
  | "IN_PROGRESS"
  | "REVIEW"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

export interface Agreement {
  id: string;
  requestId: string;
  requestTitle: string;
  proposalId: string;
  requesterUserId: string;
  responderUserId: string;
  requesterName: string;
  requesterAvatar: string;
  responderName: string;
  responderAvatar: string;
  agreedPrice: number;
  terms: string;
  scheduledFor: string;
  requesterConfirmed: boolean;
  responderConfirmed: boolean;
  paymentMode: "OFFLINE" | "ONLINE";
  status: AgreementStatus;
  createdAt?: string;
  requestArea?: string;
  providerLat?: number;
  providerLng?: number;
  liveStatus?: JobLiveStatus;
  trackingToken?: string;
  // Payment claim/confirm cycle — same vocabulary as AppointmentRecord's
  // paymentMethod/paymentStatus (types/console.ts), so the requester's "I've
  // paid" claim requires the responder's confirmation before it counts,
  // instead of a one-sided self-report.
  paymentMethod?: "UPI" | "CASH" | null;
  paymentStatus?: "UNPAID" | "PENDING_CONFIRM" | "PAID" | "REJECTED";
  paymentAmount?: number | null;
  paymentReference?: string | null;
}

export interface Review {
  id: string;
  raterName: string;
  raterAvatar: string;
  rating: number;
  comment: string;
  date: string;
  isVerifiedBooking?: boolean;
}

export interface Settlement {
  id: string;
  agreementId: string;
  withName: string;
  withAvatar: string;
  amount: number;
  mode: "CASH" | "UPI_OFFLINE";
  note: string;
  date: string;
  tip?: number;
}
