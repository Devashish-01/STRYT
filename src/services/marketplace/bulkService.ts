import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { haversineKm } from "@/lib/geocode";
import type {
  BulkDeal, BulkTier, BulkQuote, GroupBuyToken, GroupBuyRedemptionStats,
  FulfillmentType, PaymentMethod,
} from "@/types";

function rowToDeal(r: any, userLat = 0, userLng = 0): BulkDeal {
  const biz = r.business ?? {};
  const tiers: BulkTier[] = Array.isArray(r.tiers)
    ? [...r.tiers]
        .map((t: any) => ({ minQty: Number(t.minQty ?? t.min_qty ?? 0), unitPrice: Number(t.unitPrice ?? t.unit_price ?? 0) }))
        .filter((t) => t.minQty > 0 && t.unitPrice > 0)
        .sort((a, b) => a.minQty - b.minQty)
    : [];
  return {
    id: r.id,
    businessId: r.business_id,
    ownerUserId: r.owner_user_id,
    catalogItemId: r.catalog_item_id ?? null,
    title: r.title,
    description: r.description ?? null,
    image: r.image ?? null,
    regularPrice: Number(r.regular_price),
    moq: Number(r.moq ?? 1),
    tiers,
    availableQuota: r.available_quota ?? null,
    status: r.status,
    createdAtISO: r.created_at,
    businessName: biz.name ?? null,
    businessCover: biz.cover_image ?? null,
    businessUpiId: biz.upi_id ?? null,
    distanceKm:
      userLat && userLng && biz.lat && biz.lng ? haversineKm(userLat, userLng, biz.lat, biz.lng) : undefined,
  };
}

function rowToToken(r: any): GroupBuyToken {
  return {
    id: r.id,
    tokenCode: r.token_code,
    agreementId: r.agreement_id,
    requestId: r.request_id,
    holderUserId: r.holder_user_id,
    issuerUserId: r.issuer_user_id,
    businessId: r.business_id ?? null,
    quantity: Number(r.quantity ?? 1),
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
    itemLabel: r.item_label ?? null,
    status: r.status,
    redeemedAtISO: r.redeemed_at ?? null,
    redeemedBy: r.redeemed_by ?? null,
    validUntilISO: r.valid_until ?? null,
    createdAtISO: r.created_at,
    pickupPin: r.pickup_pin ?? null,
  };
}

const DEAL_SELECT = "*, business:businesses!business_id(name, cover_image, lat, lng, upi_id)";

export const bulkService = {
  // ── Business-initiated bulk deals ───────────────────────────

  /** Active wholesale offers, nearest first when a location is known. */
  async deals(p: { lat?: number; lng?: number; radius?: number } = {}): Promise<BulkDeal[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("bulk_deals")
      .select(DEAL_SELECT)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false });
    throwIfError(error);
    let out = (data ?? []).map((r) => rowToDeal(r, p.lat ?? 0, p.lng ?? 0));
    if (p.lat && p.lng && p.radius) {
      out = out.filter((d) => d.distanceKm == null || d.distanceKm <= p.radius!);
    }
    if (p.lat && p.lng) {
      out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return out;
  },

  async dealsForBusiness(businessId: string): Promise<BulkDeal[]> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("bulk_deals")
      .select(DEAL_SELECT)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map((r) => rowToDeal(r));
  },

  async getDeal(id: string): Promise<BulkDeal | undefined> {
    const sb = getSupabase();
    const { data, error } = await sb.from("bulk_deals").select(DEAL_SELECT).eq("id", id).maybeSingle();
    throwIfError(error);
    return data ? rowToDeal(data) : undefined;
  },

  async createDeal(businessId: string, deal: Partial<BulkDeal>): Promise<BulkDeal> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) throw new Error("Sign in to create a bulk deal");
    const row = {
      business_id: businessId,
      owner_user_id: uid,
      catalog_item_id: deal.catalogItemId ?? null,
      title: deal.title,
      description: deal.description ?? null,
      image: deal.image ?? null,
      regular_price: deal.regularPrice,
      moq: deal.moq ?? 1,
      tiers: deal.tiers ?? [],
      available_quota: deal.availableQuota ?? null,
    };
    const { data, error } = await sb.from("bulk_deals").insert(row as any).select(DEAL_SELECT).maybeSingle();
    throwIfError(error);
    return rowToDeal(data);
  },

  async updateDeal(id: string, patch: Partial<BulkDeal>): Promise<BulkDeal> {
    const sb = getSupabase();
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.image !== undefined) row.image = patch.image;
    if (patch.regularPrice !== undefined) row.regular_price = patch.regularPrice;
    if (patch.moq !== undefined) row.moq = patch.moq;
    if (patch.tiers !== undefined) row.tiers = patch.tiers;
    if (patch.availableQuota !== undefined) row.available_quota = patch.availableQuota;
    if (patch.status !== undefined) row.status = patch.status;
    const { data, error } = await sb.from("bulk_deals").update(row as any).eq("id", id).select(DEAL_SELECT).maybeSingle();
    throwIfError(error);
    if (!data) throw new Error("Couldn't save — you may not have permission to change this deal.");
    return rowToDeal(data);
  },

  async deleteDeal(id: string) {
    const sb = getSupabase();
    const { error } = await sb.from("bulk_deals").delete().eq("id", id);
    throwIfError(error);
    return { ok: true };
  },

  // ── Buying a bulk deal ──────────────────────────────────────

  /** Server-side price quote. The sheet shows THIS rather than computing
   *  locally, so the figure on screen is guaranteed to be the figure charged —
   *  calcBulkTotal() is the same maths but the server is the authority. */
  async quote(dealId: string, quantity: number): Promise<BulkQuote> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("bulk_deal_quote", { p_deal_id: dealId, p_quantity: quantity });
    throwIfError(error);
    const row: any = Array.isArray(data) ? data[0] : data;
    return {
      unitPrice: Number(row?.unit_price ?? 0),
      total: Number(row?.total ?? 0),
      regularTotal: Number(row?.regular_total ?? 0),
      saved: Number(row?.saved ?? 0),
      meetsMoq: Boolean(row?.meets_moq),
      quotaOk: Boolean(row?.quota_ok),
    };
  },

  /** Place a bulk order. Price, MOQ and quota are all enforced server-side
   *  under a row lock — the client can't name its own discount or oversell. */
  async order(
    dealId: string,
    quantity: number,
    method: PaymentMethod,
    opts: { reference?: string | null; fulfillment?: FulfillmentType; address?: string | null } = {}
  ) {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("bulk_deal_order", {
      p_deal_id: dealId,
      p_quantity: quantity,
      p_method: method,
      p_reference: opts.reference ?? undefined,
      p_fulfillment: opts.fulfillment ?? "STORE_PICKUP",
      p_address: opts.address ?? undefined,
    });
    throwIfError(error);
    return data;
  },

  // ── Group buy claim passes ──────────────────────────────────

  /** This user's own QR passes. RLS scopes it — no client-side filtering. */
  async myTokens(): Promise<GroupBuyToken[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await sb
      .from("group_buy_tokens")
      .select("*")
      .eq("holder_user_id", uid)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return (data ?? []).map(rowToToken);
  },

  /** Merchant-side roster of every pass on an agreement. Goes through an RPC,
   *  not a table select: the table's read policy only covers holder/issuer, so
   *  a delegated staff member with `appointments` scope would otherwise see
   *  nothing. The RPC does that scope check server-side. */
  async tokensForAgreement(agreementId: string): Promise<GroupBuyToken[]> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("group_buy_tokens_for_agreement", { p_agreement_id: agreementId });
    throwIfError(error);
    return ((data ?? []) as any[]).map(rowToToken);
  },

  /** Merchant scan. Server-side `for update` + status guard means a double
   *  scan raises ALREADY_REDEEMED instead of handing goods over twice. */
  async redeemToken(tokenCode: string): Promise<GroupBuyToken> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("group_buy_token_redeem", { p_token_code: tokenCode });
    throwIfError(error);
    return rowToToken(data);
  },

  async redemptionStats(agreementId: string): Promise<GroupBuyRedemptionStats> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("group_buy_redemption_stats", { p_agreement_id: agreementId });
    throwIfError(error);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      total: Number(row?.total ?? 0),
      redeemed: Number(row?.redeemed ?? 0),
      pending: Number(row?.pending ?? 0),
    };
  },
};
