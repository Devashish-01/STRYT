import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { toCamel } from "@/lib/caseMap";
import { aliasName } from "@/lib/publicName";
import type { Conversation, Message, ChatSubject } from "@/types";

/**
 * Resolve what THIS user should see as the "other side" of a conversation.
 * For a listing chat the customer sees the business/provider; the owner sees
 * the actual customer. Plain user↔user chats always show the other person.
 */
function resolveOther(
  c: Conversation,
  uid: string,
  profile?: { id: string; name: string; avatar: string }
): { id: string; name: string; avatar: string } | undefined {
  const otherId = c.participantA === uid ? c.participantB : c.participantA;
  if (c.subjectId && uid !== c.subjectOwnerId) {
    // I'm the customer → show the listing's identity.
    return { id: otherId, name: c.subjectName ?? "Business", avatar: c.subjectAvatar ?? "" };
  }
  return profile ?? { id: otherId, name: "STRYT user", avatar: "" };
}

/** Always store participants in lexicographic order so the UNIQUE constraint works. */
function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Which "inbox" a conversation belongs to, from the current user's point of view.
 *  - CUSTOMER: my personal chats + any chat where I'm NOT the listing owner
 *    (i.e. I'm the customer messaging a business/provider).
 *  - BUSINESS/PROVIDER: chats about a listing I own, of that type + id — these
 *    are the messages a business/provider owner receives from customers.
 * Omit the scope entirely for the unified "everything" view.
 */
export type ChatScope = { scope: "CUSTOMER" | "BUSINESS" | "PROVIDER"; id?: string };

/**
 * Push the inbox partition down to Postgres so we transfer only matching rows
 * (or just a count) instead of pulling every conversation and filtering in JS.
 *  - CUSTOMER: I'm not the listing owner — personal chats (no owner) OR chats
 *    whose subject_owner_id isn't me.
 *  - BUSINESS/PROVIDER: chats about a listing I own, of that type (+ id).
 */
function applyChatScope<T>(q: T, uid: string, scope?: ChatScope): T {
  if (!scope) return q;
  const b = q as any;
  if (scope.scope === "CUSTOMER") {
    // `neq` excludes NULLs in PostgREST, so OR in the null case explicitly.
    return b.or(`subject_owner_id.is.null,subject_owner_id.neq.${uid}`);
  }
  const wantType = scope.scope === "BUSINESS" ? "business" : "provider";
  let r = b.eq("subject_owner_id", uid).eq("subject_type", wantType);
  if (scope.id) r = r.eq("subject_id", scope.id);
  return r;
}

/** Format a timestamp into a human-readable short label ("just now", "5m", "2h", "Mon"). */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short" });
}

export const chatService = {
  /** All conversations for the current user, enriched with the other person's profile. */
  async conversations(scope?: ChatScope): Promise<Conversation[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];

    let listQ = sb
      .from("conversations")
      .select("*")
      .or(`participant_a.eq.${uid},participant_b.eq.${uid}`);
    listQ = applyChatScope(listQ, uid, scope);
    const { data, error } = await listQ.order("last_message_at", { ascending: false });
    throwIfError(error);

    const convs = toCamel<Conversation[]>(data ?? []);
    if (convs.length === 0) return [];

    // Batch-fetch the other participant's profile.
    const otherIds = convs.map((c) => (c.participantA === uid ? c.participantB : c.participantA));
    const { data: users } = await sb
      .from("users")
      .select("id, name, alias, avatar")
      .in("id", [...new Set(otherIds)]);

    // Chat is a pre-relationship context — show the other person's public alias,
    // not their real name (the real name is revealed only on booking/queue/proposal).
    const userMap = Object.fromEntries(
      (users ?? []).map((u: { id: string; name: string; alias?: string | null; avatar: string }) =>
        [u.id, { id: u.id, name: aliasName(u), avatar: u.avatar ?? "" }])
    );

    return convs.map((c) => ({
      ...c,
      otherUser: resolveOther(c, uid, userMap[c.participantA === uid ? c.participantB : c.participantA]),
    }));
  },

  /**
   * Find an existing conversation with otherUserId (optionally about a specific
   * business/provider), or create one. Throws if you try to message yourself.
   */
  async getOrCreate(otherUserId: string, subject?: ChatSubject): Promise<Conversation> {
    if (otherUserId && subject && subject.ownerUserId !== otherUserId) {
      // Defensive: the "other user" of a listing chat must be the owner.
      otherUserId = subject.ownerUserId;
    }

    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");
    if (otherUserId === uid) throw new Error("You can't message your own listing.");

    const [pa, pb] = sortedPair(uid, otherUserId);

    // Try to find an existing thread for this exact pair + subject.
    let findQ = sb
      .from("conversations")
      .select("*")
      .eq("participant_a", pa)
      .eq("participant_b", pb);
    findQ = subject ? findQ.eq("subject_id", subject.id) : findQ.is("subject_id", null);
    const { data: existing } = await findQ.maybeSingle();

    if (existing) {
      const conv = toCamel<Conversation>(existing);
      const { data: user } = await sb.from("users").select("id, name, alias, avatar").eq("id", otherUserId).maybeSingle();
      const aliased = user ? { id: user.id, name: aliasName(user as any), avatar: (user as any).avatar ?? "" } : undefined;
      return { ...conv, otherUser: resolveOther(conv, uid, aliased) };
    }

    // Create new conversation, carrying the subject context if present.
    const { data: created, error } = await sb
      .from("conversations")
      .insert({
        participant_a: pa,
        participant_b: pb,
        subject_type: subject?.type ?? null,
        subject_id: subject?.id ?? null,
        subject_name: subject?.name ?? null,
        subject_avatar: subject?.avatar ?? null,
        subject_owner_id: subject?.ownerUserId ?? null,
      })
      .select()
      .maybeSingle();
    throwIfError(error);

    const conv = toCamel<Conversation>(created);
    const { data: user } = await sb.from("users").select("id, name, alias, avatar").eq("id", otherUserId).maybeSingle();
    const aliased = user ? { id: user.id, name: aliasName(user as any), avatar: (user as any).avatar ?? "" } : undefined;
    return { ...conv, otherUser: resolveOther(conv, uid, aliased) };
  },

  /** All messages in a conversation, oldest first. */
  async messages(conversationId: string): Promise<Message[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    throwIfError(error);
    return toCamel<Message[]>(data ?? []);
  },

  /** Send a message (optionally with an image) and update conversation preview + unread flag on the other side. */
  async send(conversationId: string, body: string, conv: Conversation, imageUrl?: string): Promise<Message> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Not authenticated");

    const { data: msg, error: msgErr } = await sb
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: uid, body, image_url: imageUrl ?? null })
      .select()
      .maybeSingle();
    throwIfError(msgErr);

    // Update conversation: preview, timestamp, other side's unread flag.
    const isA = uid === conv.participantA;
    await sb.from("conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: imageUrl ? "📷 Photo" : body.slice(0, 80),
      ...(isA ? { has_unread_b: true, has_unread_a: false } : { has_unread_a: true, has_unread_b: false }),
    }).eq("id", conversationId);

    return toCamel<Message>(msg);
  },

  /** Mark conversation as read for the current user (reset their unread flag + read-receipt timestamp). */
  async markRead(conversationId: string, conv: Conversation): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const isA = uid === conv.participantA;
    const nowIso = new Date().toISOString();
    await sb.from("conversations")
      .update(isA ? { has_unread_a: false, last_read_at_a: nowIso } : { has_unread_b: false, last_read_at_b: nowIso })
      .eq("id", conversationId);
  },

  /**
   * One typing channel per conversation, used for both sending and receiving —
   * broadcast sends need the channel already joined, so listen+send share the
   * same subscribed instance rather than creating a fresh one per send.
   */
  connectTyping(conversationId: string, onTyping: (userId: string) => void): { send: (uid: string) => void; unsubscribe: () => void } {
    const sb = getSupabase();
    const channel = sb
      .channel("typing:" + conversationId)
      .on("broadcast", { event: "typing" }, (payload: any) => onTyping(payload.payload.userId))
      .subscribe();
    return {
      send: (uid: string) => { channel.send({ type: "broadcast", event: "typing", payload: { userId: uid } }); },
      unsubscribe: () => { sb.removeChannel(channel); },
    };
  },

  /**
   * Count of conversations with unread messages for the current user, in a scope.
   * Whether the unread flag is has_unread_a or _b depends on which participant
   * slot is mine, so this runs as two server-side head-counts (no rows pulled)
   * and sums them — the pair is mutually exclusive, so there's no double count.
   */
  async totalUnread(scope?: ChatScope): Promise<number> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return 0;

    const countAs = async (participantCol: string, unreadCol: string): Promise<number> => {
      let q = sb
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq(participantCol, uid)
        .eq(unreadCol, true);
      q = applyChatScope(q, uid, scope);
      const { count } = await q;
      return count ?? 0;
    };

    const [a, b] = await Promise.all([
      countAs("participant_a", "has_unread_a"),
      countAs("participant_b", "has_unread_b"),
    ]);
    return a + b;
  },

  /**
   * Subscribe to new messages in a conversation via Supabase Realtime.
   * Returns a cleanup function — call it in useEffect's return.
   */
  subscribe(conversationId: string, onMessage: (msg: Message) => void): () => void {
    const sb = getSupabase();
    const channel = sb
      .channel("chat:" + conversationId)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          onMessage(toCamel<Message>(payload.new));
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  },
};
