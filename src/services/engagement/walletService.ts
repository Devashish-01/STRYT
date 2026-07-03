import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import type { LoyaltyCard, Coupon, Settlement } from "@/types";

export interface WalletData {
  loyaltyCards: LoyaltyCard[];
  coupons: Coupon[];
  settlements: Settlement[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const walletService = {
  // ── Phase 35 + 36 + 37: full wallet ──────────────────────────
  async get(): Promise<WalletData> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return { loyaltyCards: [], coupons: [], settlements: [] };

    const [lcRes, stampRes, couponRes, settlRes] = await Promise.all([
      // active loyalty cards with their business info
      sb.from("loyalty_cards")
        .select("id, target, reward, business_id, businesses(name, cover_image)")
        .eq("is_active", true),
      // this user's stamp counts
      sb.from("user_stamps")
        .select("card_id, stamps")
        .eq("user_id", uid),
      // this user's saved coupons (join offer + business)
      sb.from("user_saved_coupons")
        .select("offer_id, offers(id, title, code, valid_until, business_id, businesses(name))")
        .eq("user_id", uid),
      // this user's settlement ledger (join the other party)
      sb.from("settlements")
        .select("*, users!with_user_id(name, avatar)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
    ]);

    // Loyalty cards
    const stampMap: Record<string, number> = {};
    for (const s of stampRes.data ?? []) stampMap[s.card_id] = s.stamps;

    const loyaltyCards: LoyaltyCard[] = (lcRes.data ?? []).map((r: any) => ({
      id:            r.id,
      businessId:    r.business_id,
      businessName:  r.businesses?.name ?? "Business",
      businessImage: r.businesses?.cover_image ?? "",
      stamps:        stampMap[r.id] ?? 0,
      target:        r.target,
      reward:        r.reward,
    }));

    // Coupons
    const coupons: Coupon[] = (couponRes.data ?? [])
      .filter((r: any) => r.offers)
      .map((r: any) => ({
        id:           r.offers.id,
        businessId:   r.offers.business_id,
        businessName: r.offers.businesses?.name ?? "Business",
        title:        r.offers.title,
        code:         r.offers.code ?? "",
        validUntil:   r.offers.valid_until
          ? new Date(r.offers.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "—",
        saved: true,
      }));

    // Settlements
    const settlements: Settlement[] = (settlRes.data ?? []).map((r: any) => ({
      id:          r.id,
      agreementId: r.agreement_id,
      withName:    r.users?.name ?? "User",
      withAvatar:  r.users?.avatar ?? "",
      amount:      r.amount,
      mode:        r.mode as "CASH" | "UPI_OFFLINE",
      note:        r.note,
      date:        fmtDate(r.created_at),
      tip:         r.tip ?? 0,
    }));

    return { loyaltyCards, coupons, settlements };
  },

  // ── Phase 35: stamp ──────────────────────────────────────────
  async addStamp(cardId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    // upsert: insert with stamps=1 OR increment existing
    const { error } = await sb.rpc("increment_stamp", { p_card_id: cardId, p_user_id: uid });
    if (error) {
      // fallback: manual upsert if RPC not yet deployed
      const { data: existing } = await sb
        .from("user_stamps")
        .select("stamps")
        .eq("user_id", uid)
        .eq("card_id", cardId)
        .maybeSingle();
      await sb.from("user_stamps").upsert(
        { user_id: uid, card_id: cardId, stamps: (existing?.stamps ?? 0) + 1, updated_at: new Date().toISOString() },
        { onConflict: "user_id,card_id" }
      );
    }
  },

  // ── Phase 36: save / unsave coupon ────────────────────────────
  async saveCoupon(offerId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("user_saved_coupons").upsert(
      { user_id: uid, offer_id: offerId },
      { onConflict: "user_id,offer_id" }
    );
  },

  async unsaveCoupon(offerId: string): Promise<void> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return;
    await sb.from("user_saved_coupons").delete().eq("user_id", uid).eq("offer_id", offerId);
  },

  // ── Phase 35: business saves/updates their loyalty program ────
  async saveLoyaltyCard(businessId: string, target: number, reward: string, isActive: boolean): Promise<void> {
    const sb = getSupabase();
    await sb.from("loyalty_cards").upsert(
      { business_id: businessId, target, reward, is_active: isActive },
      { onConflict: "business_id" }
    );
  },

  async getLoyaltyCard(businessId: string): Promise<{ target: number; reward: string; isActive: boolean } | null> {
    const sb = getSupabase();
    const { data } = await sb
      .from("loyalty_cards")
      .select("target, reward, is_active")
      .eq("business_id", businessId)
      .maybeSingle();
    if (!data) return null;
    return { target: data.target, reward: data.reward, isActive: data.is_active };
  },

  async getLoyaltyCardHolders(businessId: string): Promise<{ name: string; avatar: string; stamps: number }[]> {
    const sb = getSupabase();
    const { data } = await sb
      .from("loyalty_cards")
      .select("id")
      .eq("business_id", businessId)
      .maybeSingle();
    if (!data) return [];
    const { data: stamps } = await sb
      .from("user_stamps")
      .select("stamps, users(name, avatar)")
      .eq("card_id", data.id)
      .order("stamps", { ascending: false })
      .limit(20);
    return (stamps ?? []).map((s: any) => ({
      name:   s.users?.name ?? "User",
      avatar: s.users?.avatar ?? "",
      stamps: s.stamps,
    }));
  },
};
