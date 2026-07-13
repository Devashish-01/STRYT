// Direct messaging between two users, optionally about a listing.

export interface Conversation {
  id: string;
  participantA: string;        // always the lexicographically smaller user ID
  participantB: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  hasUnreadA: boolean;
  hasUnreadB: boolean;
  lastReadAtA?: string | null;
  lastReadAtB?: string | null;
  createdAt: string;
  // Subject the conversation is "about" (a business/provider listing), if any.
  subjectType?: "business" | "provider" | null;
  subjectId?: string | null;
  subjectName?: string | null;
  subjectAvatar?: string | null;
  subjectOwnerId?: string | null;
  // Client-enriched (already resolved to what THIS user should see):
  otherUser?: { id: string; name: string; avatar: string };
}

/** What a new conversation is about — passed when messaging a listing. */
export interface ChatSubject {
  type: "business" | "provider";
  id: string;
  name: string;
  avatar: string;
  ownerUserId: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
  /** 'TEXT' (default) or 'LIVE_LOCATION' for a live-location share card. */
  kind?: string | null;
  /** Structured payload for non-text kinds — e.g. { share_id, status } for LIVE_LOCATION. */
  meta?: Record<string, any> | null;
}
