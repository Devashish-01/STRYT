import { getSupabase, currentUserId } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import { haversineKm } from "@/lib/geocode";
import type {
  BulkDeal, BulkTier, BulkDealPledge, GroupBuyToken, GroupBuyRedemptionStats, PaymentMethod,
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
    fulfillmentType: r.fulfillment_type ?? null,
    depositAmount: r.deposit_amount != null ? Number(r.deposit_amount) : null,
    closesAtISO: r.closes_at ?? null,
    pledgedQuantity: Number(r.pledged_quantity ?? 0),
    closedAtISO: r.closed_at ?? null,
    closeOutcome: r.close_outcome ?? null,
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

/** bulk_deal_tokens has the same shape as group_buy_tokens minus the
 *  agreement/request columns — one shared GroupBuyToken type, dealId instead. */
function rowToBulkDealToken(r: any): GroupBuyToken {
  return {
    id: r.id,
    tokenCode: r.token_code,
    dealId: r.deal_id,
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

function rowToPledge(r: any): BulkDealPledge {
  return {
    id: r.id,
    dealId: r.deal_id,
    userId: r.user_id,
    pledgerName: r.pledger?.alias ?? null,
    quantity: Number(r.quantity ?? 1),
    notes: r.notes ?? null,
    deliveryAddress: r.delivery_address ?? null,
    depositMethod: r.deposit_method ?? null,
    depositStatus: r.deposit_status,
    depositAmount: r.deposit_amount != null ? Number(r.deposit_amount) : null,
    depositReference: r.deposit_reference ?? null,
    createdAtISO: r.created_at,
  };
}

const DEAL_SELECT = "*, business:businesses!business_id(name, cover_image, lat, lng, upi_id)";

// Deadline auto-close, mirroring requestService.ts's sweepExpired exactly:
// opportunistic on read rather than a hard cron dependency, throttled so a
// busy feed doesn't fire it on every card. Target-hit closing is already
// server-side (a trigger on bulk_deal_pledges) — this only covers deals
// whose closes_at deadline has simply passed with nobody watching.
let lastBulkSweepAt = 0;
async function sweepExpiredDeals(sb: ReturnType<typeof getSupabase>): Promise<void> {
  if (Date.now() - lastBulkSweepAt < 120_000) return;
  // close_expired_bulk_deals is revoked from anon (same posture as
  // close_expired_requests) — a signed-out visitor can't close other
  // people's campaigns, so skip the call rather than eat a guaranteed 401.
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  lastBulkSweepAt = Date.now();
  await (sb.rpc as any)("close_expired_bulk_deals").catch(() => { lastBulkSweepAt = 0; });
}

export const bulkService = {
  // ── Business-initiated bulk deals ───────────────────────────

  /** Active wholesale offers, nearest first when a location is known. */
  async deals(p: { lat?: number; lng?: number; radius?: number } = {}): Promise<BulkDeal[]> {
    const sb = getSupabase();
    await sweepExpiredDeals(sb);
    // Bounded — this was an unbounded select over every ACTIVE deal, tolerable
    // on a screen nobody opened but not on the Community feed's first paint,
    // which fetches this on every visit.
    const { data, error } = await sb
      .from("bulk_deals")
      .select(DEAL_SELECT)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(20);
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
    await sweepExpiredDeals(sb);
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
    await sweepExpiredDeals(sb);
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
      fulfillment_type: deal.fulfillmentType ?? null,
      deposit_amount: deal.depositAmount ?? null,
      closes_at: deal.closesAtISO ?? null,
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
    if (patch.fulfillmentType !== undefined) row.fulfillment_type = patch.fulfillmentType;
    if (patch.depositAmount !== undefined) row.deposit_amount = patch.depositAmount;
    if (patch.closesAtISO !== undefined) row.closes_at = patch.closesAtISO;
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

  // ── Pledging into a bulk-buying campaign ────────────────────

  /** Fill myPledgeQuantity on a list of deals in ONE round trip — same
   *  reasoning as requestService.enrichGroupBuyPledges. pledgedQuantity
   *  itself is NOT computed here: it's denormalized on bulk_deals.pledged_quantity
   *  already, kept in sync server-side by the join/leave RPCs, so rowToDeal
   *  reads it directly. */
  async enrichMyPledges(deals: BulkDeal[]): Promise<BulkDeal[]> {
    if (deals.length === 0) return deals;
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return deals;
    const { data, error } = await (sb.from as any)("bulk_deal_pledges")
      .select("deal_id, quantity, deposit_status")
      .eq("user_id", uid)
      .in("deal_id", deals.map((d) => d.id));
    if (error) return deals;
    const mine = new Map<string, { quantity: number; status: BulkDeal["myDepositStatus"] }>();
    for (const row of (data ?? []) as { deal_id: string; quantity: number; deposit_status: string }[]) {
      mine.set(row.deal_id, { quantity: row.quantity, status: row.deposit_status as BulkDeal["myDepositStatus"] });
    }
    return deals.map((d) => {
      const p = mine.get(d.id);
      return { ...d, myPledgeQuantity: p?.quantity ?? null, myDepositStatus: p?.status ?? null };
    });
  },

  /** Pledge (or re-pledge — upserts) a quantity into a campaign. No payment
   *  yet: this only reserves the intent, claimDeposit is a separate step. */
  async pledgeJoin(dealId: string, quantity: number, notes?: string | null, deliveryAddress?: string | null): Promise<BulkDeal> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_pledge_join", {
      p_deal_id: dealId,
      p_quantity: quantity,
      p_notes: notes ?? undefined,
      p_delivery_address: deliveryAddress ?? undefined,
    });
    throwIfError(error);
    return rowToDeal(data);
  },

  async pledgeLeave(dealId: string): Promise<BulkDeal> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_pledge_leave", { p_deal_id: dealId });
    throwIfError(error);
    return rowToDeal(data);
  },

  /** Claim payment of the campaign's flat deposit. Same UNPAID → PENDING_CONFIRM
   *  shape as agreement_claim_payment — the business confirms/rejects from the
   *  console, this only records what the pledger says they paid. */
  async claimDeposit(dealId: string, method: PaymentMethod, reference?: string | null) {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_pledge_claim_deposit", {
      p_deal_id: dealId,
      p_method: method,
      p_reference: reference ?? undefined,
    });
    throwIfError(error);
    return data;
  },

  // ── Business-side campaign management (Phase 3) ─────────────

  /** Full pledger roster for the owner's own console — a direct table read,
   *  not an RPC: read_bulk_deal_pledges' RLS policy already covers the deal
   *  owner/team via has_business_access, same posture as request_me_toos. */
  async pledgesForDeal(dealId: string): Promise<BulkDealPledge[]> {
    const sb = getSupabase();
    const { data, error } = await (sb.from as any)("bulk_deal_pledges")
      .select("*, pledger:users!user_id(alias)")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(rowToPledge);
  },

  /** Business confirms a pledger's PENDING_CONFIRM deposit. This is also the
   *  moment that pledge starts counting toward the campaign's auto-close
   *  target — the server trigger, not this call, decides that. */
  async confirmDeposit(dealId: string, pledgerUserId: string): Promise<BulkDealPledge> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_pledge_confirm_deposit", {
      p_deal_id: dealId,
      p_pledger_user_id: pledgerUserId,
    });
    throwIfError(error);
    return rowToPledge(data);
  },

  async rejectDeposit(dealId: string, pledgerUserId: string): Promise<BulkDealPledge> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_pledge_reject_deposit", {
      p_deal_id: dealId,
      p_pledger_user_id: pledgerUserId,
    });
    throwIfError(error);
    return rowToPledge(data);
  },

  /** Close a campaign. Omit outcome to let the server decide (FULFILLED if
   *  the paid pool already met MOQ); pass FULFILLED/REFUNDED explicitly for
   *  the under-target "fulfil anyway" / "refund everyone" decision. */
  async closeDeal(dealId: string, outcome?: "FULFILLED" | "REFUNDED" | null): Promise<BulkDeal> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_close", {
      p_deal_id: dealId,
      p_outcome: outcome ?? undefined,
    });
    throwIfError(error);
    return rowToDeal(data);
  },

  /** Push the deadline out — works on a still-open campaign or one that
   *  closed under target awaiting a decision, not one already resolved. */
  async extendDeal(dealId: string, newClosesAtISO: string): Promise<BulkDeal> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_extend", {
      p_deal_id: dealId,
      p_new_closes_at: newClosesAtISO,
    });
    throwIfError(error);
    return rowToDeal(data);
  },

  /** Claim-pass roster for a closed (FULFILLED) campaign. */
  async tokensForDeal(dealId: string): Promise<GroupBuyToken[]> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_tokens_for_deal", { p_deal_id: dealId });
    throwIfError(error);
    return ((data ?? []) as any[]).map(rowToBulkDealToken);
  },

  async dealRedemptionStats(dealId: string): Promise<GroupBuyRedemptionStats> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("bulk_deal_redemption_stats", { p_deal_id: dealId });
    throwIfError(error);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      total: Number(row?.total ?? 0),
      redeemed: Number(row?.redeemed ?? 0),
      pending: Number(row?.pending ?? 0),
    };
  },

  // ── Group buy & bulk deal claim passes ───────────────────────

  /** This user's own QR passes — both a group buy's and a bulk-deal
   *  campaign's, merged newest-first. RLS scopes each table — no
   *  client-side filtering needed beyond the merge/sort. */
  async myTokens(): Promise<GroupBuyToken[]> {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!uid) return [];
    const [groupRes, bulkRes] = await Promise.all([
      sb.from("group_buy_tokens").select("*").eq("holder_user_id", uid).order("created_at", { ascending: false }),
      (sb.from as any)("bulk_deal_tokens").select("*").eq("holder_user_id", uid).order("created_at", { ascending: false }),
    ]);
    throwIfError(groupRes.error);
    throwIfError(bulkRes.error);
    const merged = [...(groupRes.data ?? []).map(rowToToken), ...((bulkRes.data ?? []) as any[]).map(rowToBulkDealToken)];
    return merged.sort((a, b) => new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime());
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
   *  scan raises ALREADY_REDEEMED instead of handing goods over twice.
   *  Dispatches by the code's own prefix — STRYT-D- mints from a bulk-deal
   *  campaign close, plain STRYT- from a group buy's agreement — so one
   *  scanner (BulkDealsManager's) handles passes from either source. */
  async redeemToken(tokenCode: string): Promise<GroupBuyToken> {
    const sb = getSupabase();
    const trimmed = tokenCode.trim().toUpperCase();
    if (trimmed.startsWith("STRYT-D-")) {
      const { data, error } = await (sb.rpc as any)("bulk_deal_token_redeem", { p_token_code: trimmed });
      throwIfError(error);
      return rowToBulkDealToken(data);
    }
    const { data, error } = await sb.rpc("group_buy_token_redeem", { p_token_code: trimmed });
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
