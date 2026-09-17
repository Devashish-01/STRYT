import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { aliasName } from "@/lib/publicName";
import { chatService } from "@/services/engagement/chatService";

export interface ContactUser {
  id: string;
  name: string;
  avatar: string;
}

export interface LiveShareView {
  lat: number | null;
  lng: number | null;
  status: "ACTIVE" | "ENDED";
  updatedAt: string;
  sharerName: string;
  sharerAvatar: string;
}

/**
 * Emergency-contact management + live-location sharing.
 *
 * Replaces the old SMS-based SOS. Contacts are STRYT users (delivery is via
 * chat), sourced from people you've already messaged. When you start a share,
 * your live coordinates stream to those contacts as a map card in your chat
 * with them, until you turn it off — see supabase/migrations/
 * 20260818_live_location_sharing.sql for the RPCs backing every call here.
 */
export const emergencyService = {
  // People I can add as emergency contacts: users I've already chatted with,
  // minus those already on my list. Matches the "already connected in-app"
  // privacy model — no user-directory lookup.
  async candidateContacts(query?: string): Promise<ContactUser[]> {
    const uid = await currentUserId();
    if (!uid) return [];
    const [convs, existing] = await Promise.all([
      chatService.conversations(),
      this.listContacts(),
    ]);
    const taken = new Set(existing.map((c) => c.id));
    const seen = new Set<string>();
    const q = query?.trim().toLowerCase();
    const out: ContactUser[] = [];
    for (const c of convs) {
      const o = c.otherUser;
      if (!o || o.id === uid || taken.has(o.id) || seen.has(o.id)) continue;
      if (q && !o.name.toLowerCase().includes(q)) continue;
      seen.add(o.id);
      out.push({ id: o.id, name: o.name, avatar: o.avatar });
    }
    return out;
  },

  async searchCandidates(query: string): Promise<ContactUser[]> {
    return this.candidateContacts(query);
  },

  /** Adds someone by their mobile number, email or username (20260988). The lookup happens inside a server function,
   *  so there is still no directory to browse — you have to already know how to reach them (ECON-1). */
  async addByIdentifier(identifier: string): Promise<ContactUser> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("emergency_contact_add_by_identifier", { p_identifier: identifier.trim() });
    if (error) {
      const msg = String(error.message ?? "");
      throw new Error(
        msg.includes("USER_NOT_FOUND") ? "Nobody on STRYT with that number, email or username."
        : msg.includes("CANNOT_ADD_YOURSELF") ? "That's you."
        : msg.includes("TOO_MANY_CONTACTS") ? "You can have up to 10 emergency contacts — remove one first."
        : msg.includes("IDENTIFIER_REQUIRED") ? "Enter a mobile number, email or username."
        : "Couldn't add that contact. Try again.",
      );
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { id: row?.contact_user_id ?? "", name: row?.contact_name ?? "Contact", avatar: row?.contact_avatar ?? "" };
  },

  // My current emergency contacts, resolved to their profile.
  async listContacts(): Promise<ContactUser[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("emergency_contacts")
      .select("contact_user_id, contact:users!contact_user_id(id, name, alias, avatar)")
      .eq("owner_user_id", uid)
      .order("created_at", { ascending: true });
    // Throwing puts the screen into its error state with a retry; returning [] here used to render "No emergency
    // contacts" — the most alarming possible lie on this screen (ECON-4).
    throwIfError(error);
    return (data ?? []).map((r) => ({
      id: r.contact_user_id,
      name: aliasName(r.contact ?? {}),
      avatar: r.contact?.avatar ?? "",
    }));
  },

  async addContact(contactUserId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await sb
      .from("emergency_contacts")
      .insert({ owner_user_id: uid, contact_user_id: contactUserId });
    // Ignore duplicate (already a contact); surface anything else.
    if (error && !/duplicate|unique/i.test(error.message)) throwIfError(error);
  },

  async removeContact(contactUserId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await sb
      .from("emergency_contacts")
      .delete()
      .eq("owner_user_id", uid)
      .eq("contact_user_id", contactUserId);
    throwIfError(error);
  },

  // Begin sharing — fans a live card + push out to every contact. Returns the
  // share id the device then keeps refreshing via updateShare.
  async startShare(lat: number, lng: number): Promise<string | null> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("start_live_share", { p_lat: lat, p_lng: lng });
    throwIfError(error);
    return (data as string) ?? null;
  },

  async updateShare(lat: number, lng: number, accuracy?: number, heading?: number): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("update_live_share", {
      p_lat: lat, p_lng: lng,
      p_accuracy: accuracy, p_heading: heading,
    });
    throwIfError(error);
  },

  async stopShare(): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("stop_live_share");
    throwIfError(error);
  },

  // Who's currently receiving my active share — previously nowhere to see
  // this at all, only an all-or-nothing stop (flow-completeness audit,
  // workflow 10).
  async myShareRecipients(): Promise<{ userId: string; name: string; avatar: string | null }[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("my_live_share_recipients");
    throwIfError(error);
    return (data ?? []).map((r) => ({ userId: r.recipient_user_id, name: r.recipient_name, avatar: r.recipient_avatar ?? null }));
  },

  // Drop ONE recipient from an active share without stopping it for everyone.
  async revokeShareRecipient(recipientUserId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("revoke_live_share_recipient", { p_recipient_user_id: recipientUserId });
    throwIfError(error);
  },

  // The read path recipients poll — returns coords only if I'm the sharer or a
  // recipient of this specific session (enforced server-side).
  async getShare(shareId: string): Promise<LiveShareView | null> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("get_live_share", { p_share_id: shareId }).maybeSingle();
    if (error) return null;
    if (!data) return null;
    const r = data as any;
    return {
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      status: r.status,
      updatedAt: r.updated_at,
      sharerName: r.sharer_name ?? "Someone",
      sharerAvatar: r.sharer_avatar ?? "",
    };
  },

  // On app load: is there already an ACTIVE session I own? (Restores the
  // "you're sharing" banner + resumes the location pusher.)
  async myActiveShareId(): Promise<string | null> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return null;
    const { data, error } = await sb
      .from("live_shares")
      .select("id")
      .eq("sharer_user_id", uid)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) return null;
    return (data as any)?.id ?? null;
  },
};
