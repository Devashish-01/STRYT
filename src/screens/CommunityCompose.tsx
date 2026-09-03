import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SafeImg } from "@/components/common";
import { Camera, Plus, Minus, X, Store, Wrench, Image, MapPin, Check, User, Megaphone, Clock, Tag, ChevronDown, MessageCircle, Eye, Package } from "@/components/Icons";
import ListingPickerSheet from "@/components/ListingPickerSheet";
import { CommunityCard } from "@/components/cards";
import { communityService, uploadService, businessService, providerService, bulkService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useDraft } from "@/hooks/useDraft";
import { haptics } from "@/lib/haptics";
import { isDraftMeaningful, validateDraft, type DraftIdentity } from "@/lib/communityDraft";
import { COMMENT_POLICIES, COMMENT_POLICY_META } from "@/lib/commentPolicy";
import { resolvePackage, BUSINESS_PACKAGES } from "@/lib/businessPackages";
import {
  addMedia,
  alertExpiryHours,
  canAddMedia,
  draftToCreateInput,
  draftToPreviewPost,
  promoteMediaToCover,
  removeMediaAt,
} from "@/lib/communityPost";
import {
  ALERT_SEVERITIES,
  COMMUNITY_TYPES,
  COMMUNITY_TYPE_META,
  MAX_BODY_LEN,
  MAX_POLL_OPTIONS,
  MAX_POST_MEDIA,
  MAX_TITLE_LEN,
  MIN_POLL_OPTIONS,
  MIN_TITLE_LEN,
  PHOTO_FORWARD_TYPES,
  POLL_DURATIONS,
} from "@/lib/communityTypes";
import { FULFILLMENT_LABELS, type CommunityPostType, type FulfillmentType, type BulkTier, type PostTag } from "@/types";

interface SellerContext {
  type: "business" | "provider";
  id: string;
  name: string;
  avatar?: string;
}

/** Reads the seller identity the ManageDashboard/ProviderDashboard "Post to community"
 *  tile passed via route state — absent for the regular customer compose entry, in
 *  which case the post goes out under the signed-in user's own name as before. */
function readSellerContext(state: unknown): SellerContext | null {
  const s = (state ?? {}) as Record<string, any>;
  if (s.businessId) return { type: "business", id: s.businessId, name: s.businessName ?? "Business", avatar: s.businessAvatar };
  if (s.providerId) return { type: "provider", id: s.providerId, name: s.providerName ?? "Provider", avatar: s.providerAvatar };
  return null;
}

/** The radius the post will actually reach, mirroring communityService.feed()'s
 *  own source of truth so the composer can't promise a reach the feed won't
 *  honour. */
function reachRadiusKm(): number {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("settings_radius") : null;
  const parsed = saved ? parseFloat(saved) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export default function CommunityCompose() {
  const nav = useNavigate();
  const loc = useLocation();
  const { area, user, showToast, activeContext } = useApp();

  const { data: activeBiz, loading: bizLoading } = useQuery(
    () => activeContext.type === "business" && activeContext.id ? businessService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type],
    activeContext.type === "business" && activeContext.id ? `business:${activeContext.id}` : undefined
  );
  const { data: activeProv, loading: provLoading } = useQuery(
    () => activeContext.type === "provider" && activeContext.id ? providerService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type],
    activeContext.type === "provider" && activeContext.id ? `provider:${activeContext.id}` : undefined
  );

  const passedCtx = readSellerContext(loc.state);
  // The router-state context (from a dashboard's "Post to community" tile) is
  // available instantly; the active-role fallback below resolves async — a
  // fast tap on "Post" before it lands could otherwise post under the wrong
  // identity, so submit is blocked (see canPost) until this settles.
  const sellerCtxLoading = !passedCtx && (
    (activeContext.type === "business" && !!activeContext.id && bizLoading) ||
    (activeContext.type === "provider" && !!activeContext.id && provLoading)
  );
  const sellerCtx = passedCtx || (
    activeContext.type === "business" && activeBiz ? {
      type: "business" as const,
      id: activeBiz.id,
      name: activeBiz.name,
      avatar: activeBiz.coverImage
    } : activeContext.type === "provider" && activeProv ? {
      type: "provider" as const,
      id: activeProv.id,
      name: activeProv.displayName,
      avatar: activeProv.avatar
    } : null
  );
  const sellerLat = sellerCtx?.type === "business" ? activeBiz?.lat : sellerCtx?.type === "provider" ? activeProv?.lat : undefined;
  const sellerLng = sellerCtx?.type === "business" ? activeBiz?.lng : sellerCtx?.type === "provider" ? activeProv?.lng : undefined;

  // Own fetch rather than reusing activeBiz: sellerCtx can come from a
  // dashboard's "Post to community" tile (passedCtx) for a business that
  // isn't necessarily the caller's activeContext, and package eligibility
  // has to match the business the campaign will actually post under.
  const { data: sellerBiz } = useQuery(
    () => (sellerCtx?.type === "business" ? businessService.get(sellerCtx.id) : Promise.resolve(null)),
    [sellerCtx?.type, sellerCtx?.id],
    sellerCtx?.type === "business" ? `business:${sellerCtx.id}` : undefined
  );
  // showCartStepper is the same signal BusinessStoreHub's "Bulk deals" tile
  // gates on — a consultation isn't something you buy 3 of, so 8 of 13
  // packages have nothing sensible to configure here.
  const showBulkBuying = sellerCtx?.type === "business" && sellerBiz ? BUSINESS_PACKAGES[resolvePackage(sellerBiz)].showCartStepper : false;

  // Pre-armed when arriving from BulkDealsManager's "New campaign" button —
  // that screen is only reachable under the same showCartStepper gate this
  // toggle uses, so trusting the flag here can't strand an ineligible seller.
  const [isBulkBuying, setIsBulkBuying] = useState(() => !!(loc.state as any)?.bulkBuying);
  const [regularPrice, setRegularPrice] = useState("");
  const [campaignMoq, setCampaignMoq] = useState("10");
  const [campaignTiers, setCampaignTiers] = useState<BulkTier[]>([{ minQty: 10, unitPrice: 0 }]);
  const [campaignQuota, setCampaignQuota] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [campaignFulfillment, setCampaignFulfillment] = useState<FulfillmentType | null>(null);

  // Drafts are per-identity: a half-written shop announcement must never
  // reappear under your personal name. Held back until the seller identity
  // settles, for the same reason submit is.
  const draftIdentity: DraftIdentity | null = sellerCtxLoading
    ? null
    : sellerCtx
      ? { type: sellerCtx.type, id: sellerCtx.id }
      : { type: "user", id: user.id || "self" };
  const { draft, patch, discard, justSaved, restored, acknowledgeRestore } = useDraft(draftIdentity);

  // Arriving from a share sheet's "Recommend to neighbours": pre-arm a SHOUTOUT
  // with that listing already tagged, rather than inventing a repost model —
  // a shoutout tagging a business IS the app's "tell the street about this
  // place" post. Applied once, and only after useDraft's own restore effect
  // has run for this identity (that hook is called above, so its effects fire
  // first in the same commit) — otherwise a restored draft would clobber it.
  const prefill = (loc.state as any)?.prefill as
    | { type?: CommunityPostType; taggedListing?: PostTag }
    | undefined;
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (!prefill || prefillApplied.current || !draftIdentity) return;
    prefillApplied.current = true;
    patch({
      ...(prefill.type ? { type: prefill.type } : {}),
      ...(prefill.taggedListing ? { taggedListing: prefill.taggedListing } : {}),
    });
    setPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftIdentity?.type, draftIdentity?.id]);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  // Collapsed once a type is chosen (progressive disclosure) — reopened by the
  // chip's "Change" affordance.
  const [pickerOpen, setPickerOpen] = useState(true);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  function validateCampaign(): { ok: boolean; message: string | null } {
    const title = draft.title.trim();
    if (title.length < MIN_TITLE_LEN) return { ok: false, message: `Add a title — at least ${MIN_TITLE_LEN} characters` };
    const rp = parseFloat(regularPrice);
    if (!Number.isFinite(rp) || rp <= 0) return { ok: false, message: "Enter the regular price" };
    const m = parseInt(campaignMoq, 10);
    if (!Number.isFinite(m) || m < 1) return { ok: false, message: "Target quantity must be at least 1" };
    if (depositAmount) {
      const dep = parseFloat(depositAmount);
      if (!Number.isFinite(dep) || dep <= 0) return { ok: false, message: "Deposit must be a positive amount" };
      if (dep > rp) return { ok: false, message: "Deposit can't be more than the regular price" };
    }
    return { ok: true, message: null };
  }

  const meta = draft.type ? COMMUNITY_TYPE_META[draft.type] : null;
  const validation = validateDraft(draft);
  const campaignValidation = isBulkBuying ? validateCampaign() : { ok: true, message: null as string | null };
  const canPost = (isBulkBuying ? campaignValidation.ok : validation.ok) && !posting && !uploading && !sellerCtxLoading;
  const reachKm = reachRadiusKm();
  const photoForward = !!draft.type && PHOTO_FORWARD_TYPES.includes(draft.type);
  const policyMeta = COMMENT_POLICY_META[draft.commentPolicy];

  function chooseType(t: CommunityPostType) {
    haptics.selection();
    patch({ type: t });
    setPickerOpen(false);
    // Land the caret where the writing happens, so choosing a type flows
    // straight into composing instead of leaving the user to hunt for the field.
    setTimeout(() => titleRef.current?.focus(), 220);
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!canAddMedia(draft.media)) {
      showToast(`Up to ${MAX_POST_MEDIA} photos per post`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadService.upload(file, "community");
      const res = addMedia(draft.media, url);
      if (res.rejected === "AT_LIMIT") showToast(`Up to ${MAX_POST_MEDIA} photos per post`);
      else patch({ media: res.media });
    } catch {
      showToast("Couldn't upload photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleCancel() {
    // An unconditional discard on Cancel loses real work to a mistap. Anything
    // worth keeping gets the iOS three-way choice instead — the same rule
    // autosave uses, so a poll option or a lost-and-found detail counts here too.
    if (isDraftMeaningful(draft)) {
      setLeaveConfirm(true);
      return;
    }
    discard();
    nav(-1);
  }

  async function post() {
    if (!draft.type || !canPost) return;
    setPosting(true);
    haptics.medium();
    try {
      // draftToCreateInput decides which fields this type carries (and nulls the
      // rest), so switching type mid-compose can't smuggle a stale poll option
      // or severity into the row.
      const created = await communityService.create({
        ...draftToCreateInput(draft),
        area,
        lat: sellerCtx ? sellerLat : (user.lat || undefined),
        lng: sellerCtx ? sellerLng : (user.lng || undefined),
        commentPolicy: draft.commentPolicy,
        hideLikeCount: draft.hideLikeCount,
        ...(sellerCtx ? { authorType: sellerCtx.type, authorRefId: sellerCtx.id, authorName: sellerCtx.name, authorAvatar: sellerCtx.avatar } : {}),
      });
      haptics.success();
      setPreviewOpen(false);
      // A beat of confirmation while the navigation is already in flight, so the
      // 500ms below reads as "it worked" instead of an unexplained pause.
      setSucceeded(true);
      discard(); // the draft has become a post; keeping it would re-offer it
      showToast("Posted to community 🏘️");
      // Land on the post itself, not /community-hub — that's a TAB_ROUTE, which
      // forces the customer BottomNav onto a business/provider-context session
      // (its Profile tab has no activeContext awareness), stranding an owner on
      // the wrong "hat" right after posting as their business/provider.
      setTimeout(() => nav(`/community/${created.id}`, { replace: true }), 500);
    } catch {
      // The draft is deliberately left intact here — a failed post is exactly
      // when losing the text hurts most.
      showToast("Couldn't post. Try again.");
      setPosting(false);
    }
  }

  async function postCampaign() {
    if (!sellerCtx || sellerCtx.type !== "business" || !canPost) return;
    setPosting(true);
    haptics.medium();
    try {
      const cleanTiers = campaignTiers.filter((t) => t.minQty > 0 && t.unitPrice > 0).sort((a, b) => a.minQty - b.minQty);
      const created = await bulkService.createDeal(sellerCtx.id, {
        title: draft.title.trim(),
        description: draft.body.trim() || null,
        image: draft.media[0] ?? null,
        regularPrice: parseFloat(regularPrice),
        moq: parseInt(campaignMoq, 10),
        tiers: cleanTiers,
        availableQuota: campaignQuota ? parseInt(campaignQuota, 10) : null,
        depositAmount: depositAmount ? parseFloat(depositAmount) : null,
        closesAtISO: closesAt ? new Date(closesAt).toISOString() : null,
        fulfillmentType: campaignFulfillment,
      });
      haptics.success();
      discard();
      showToast("Campaign published 🎉");
      setTimeout(() => nav(`/business/${sellerCtx.id}/manage/bulk-deals/${created.id}`, { replace: true }), 500);
    } catch (e: any) {
      showToast(e?.message || "Couldn't publish — try again");
      setPosting(false);
    }
  }

  const identityName = sellerCtx?.name || user.name || "You";
  const identityClass = sellerCtx?.type === "business"
    ? "compose-identity compose-identity--business"
    : sellerCtx?.type === "provider"
      ? "compose-identity compose-identity--provider"
      : "compose-identity";

  return (
    <div className="screen compose-screen">
      <header className="compose-nav">
        <button className="compose-nav-btn" onClick={handleCancel}>Cancel</button>
        <div className="compose-nav-title">
          {isBulkBuying ? "📦 Bulk-buying campaign" : meta ? `${meta.emoji} ${meta.label}` : "New post"}
        </div>
        <button
          className="compose-nav-post"
          disabled={!canPost}
          onClick={isBulkBuying ? postCampaign : post}
          aria-label={(isBulkBuying ? campaignValidation.ok : validation.ok) ? "Post" : (isBulkBuying ? campaignValidation.message : validation.message) ?? "Post"}
        >
          {posting ? "Posting…" : "Post"}
        </button>
      </header>

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 24 }}>
        {restored && (
          <div className="draft-restored" role="status">
            <span style={{ fontSize: 18 }}>📝</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="semi small" style={{ color: "var(--amber-800)" }}>Draft restored</div>
              <div className="tiny" style={{ color: "var(--amber-700)" }}>Picked up where you left off.</div>
            </div>
            <button
              className="tiny semi"
              style={{ color: "var(--amber-800)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
              onClick={() => { discard(); setPickerOpen(true); }}
            >
              Start over
            </button>
            <button className="icon-btn" aria-label="Dismiss" onClick={acknowledgeRestore} style={{ width: 26, height: 26 }}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* Identity + reach. Always shown, not only for sellers: "who is this
            going out as, and how far does it go" is the question people hesitate
            over before posting, and it was previously invisible for regular
            members. */}
        <div className={identityClass}>
          <SafeImg
            src={sellerCtx?.avatar || user.avatar}
            variant={sellerCtx?.type === "business" ? "photo" : "avatar"}
            className="thumb"
            style={{ width: 40, height: 40, borderRadius: sellerCtx?.type === "business" ? 10 : "50%", flexShrink: 0 }}
          />
          <div className="grow col" style={{ gap: 3, minWidth: 0 }}>
            <div className="tiny muted">Posting as</div>
            <div className="semi small ellipsis" style={{ fontSize: 14.5 }}>{identityName}</div>
            <span className="compose-reach">
              <MapPin size={11} /> {area || "your street"} · {reachKm} km
            </span>
          </div>
          <span className={`badge row gap-4 center-v ${sellerCtx?.type === "business" ? "badge-orange" : sellerCtx?.type === "provider" ? "badge-green" : "badge-purple"}`}>
            {sellerCtx?.type === "business" ? <Store size={11} /> : sellerCtx?.type === "provider" ? <Wrench size={11} /> : <User size={11} />}
            {sellerCtx?.type === "business" ? "Business" : sellerCtx?.type === "provider" ? "Provider" : "You"}
          </span>
        </div>

        {/* Bulk buying — sits ABOVE the type picker, not buried in settings:
            it changes what the post fundamentally is (a business campaign
            others pledge into, not a community post), same reasoning the
            removed group-buy toggle used in AskCompose. Only a seller
            identity whose package sells countable units sees this at all. */}
        {showBulkBuying && (
          <button
            type="button"
            className="row gap-12"
            onClick={() => {
              const next = !isBulkBuying;
              setIsBulkBuying(next);
              if (next) { patch({ type: null }); setPickerOpen(false); }
              else setPickerOpen(true);
            }}
            style={{ width: "100%", padding: 14, borderRadius: 12, textAlign: "left", background: isBulkBuying ? "var(--brand-50)" : "var(--ink-50)", border: isBulkBuying ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)", alignItems: "center" }}
          >
            <Package size={20} color={isBulkBuying ? "var(--brand-700)" : "var(--ink-500)"} />
            <span className="col grow" style={{ gap: 2 }}>
              <span className="semi small" style={{ color: "var(--ink-800)" }}>Make this a bulk-buying campaign</span>
              <span className="tiny muted">Customers pledge a quantity and pay a deposit to join — you fulfil once it's full</span>
            </span>
            <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: isBulkBuying ? "none" : "2px solid var(--ink-300)", background: isBulkBuying ? "var(--brand-600)" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {isBulkBuying ? "✓" : ""}
            </span>
          </button>
        )}

        {/* Type picker — a six-tile grid until chosen, one row afterwards.
            Not applicable to a bulk-buying campaign, which isn't one of the
            six community types. */}
        {!isBulkBuying && (
          <div className="field" style={{ marginBottom: 0 }}>
            {pickerOpen || !meta ? (
              <>
                <span className="compose-section-label" id="flair-label">What kind of post?</span>
                <div className="flair-grid" role="radiogroup" aria-labelledby="flair-label">
                  {COMMUNITY_TYPES.map((t) => {
                    const isSel = draft.type === t.type;
                    return (
                      <button
                        key={t.type}
                        type="button"
                        role="radio"
                        aria-checked={isSel}
                        className={`flair-tile ${isSel ? "active" : ""}`}
                        onClick={() => chooseType(t.type)}
                      >
                        <span className="flair-tile-emoji" aria-hidden="true">{t.emoji}</span>
                        <span className="flair-tile-label">{t.action}</span>
                        <span className="flair-tile-hint">{t.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <button
                type="button"
                className="flair-chip"
                onClick={() => setPickerOpen(true)}
                aria-label={`Post type: ${meta.label}. Change`}
              >
                <span className="flair-chip-emoji" aria-hidden="true">{meta.emoji}</span>
                <span className="flair-chip-label">{meta.label}</span>
                <span className="flair-chip-change">Change</span>
              </button>
            )}
          </div>
        )}

        {(isBulkBuying || (draft.type && meta)) && (
          <>
            <div className="field">
              <label className="row between" htmlFor="compose-title">
                <span className="compose-section-label" style={{ marginBottom: 0 }}>Title *</span>
                <span className="tiny muted tabular-nums">{draft.title.length}/{MAX_TITLE_LEN}</span>
              </label>
              <input
                id="compose-title"
                ref={titleRef}
                className="input"
                placeholder={isBulkBuying ? "e.g. Alphonso Mango Farm Box" : meta?.titlePlaceholder}
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={MAX_TITLE_LEN}
                style={{ padding: "12px 16px", borderRadius: 14, fontSize: 14 }}
              />
            </div>

            <div className="field">
              <label className="row between" htmlFor="compose-body">
                <span className="compose-section-label" style={{ marginBottom: 0 }}>Details</span>
                {draft.body.length > MAX_BODY_LEN * 0.8 && (
                  <span className="tiny muted tabular-nums">{draft.body.length}/{MAX_BODY_LEN}</span>
                )}
              </label>
              <textarea
                id="compose-body"
                className="input"
                placeholder={isBulkBuying ? "Describe what's included, quality, sourcing…" : meta?.bodyPlaceholder}
                value={draft.body}
                onChange={(e) => patch({ body: e.target.value })}
                maxLength={MAX_BODY_LEN}
                style={{ padding: "12px 16px", borderRadius: 14, fontSize: 14, minHeight: 90 }}
              />
            </div>


            {/* ---- Photos: available on EVERY type ----
                Previously only Lost & Found and Giveaway had a picker, so an
                alert about a flooded road or a shoutout to a shop — the posts a
                photo makes credible — couldn't carry one. */}
            <div className="field">
              <label className="row between">
                <span className="compose-section-label" style={{ marginBottom: 0 }}>
                  Photos
                  {photoForward && <span className="tiny muted" style={{ fontWeight: 500 }}> · helps a lot here</span>}
                </span>
                <span className="tiny muted tabular-nums">{draft.media.length}/{MAX_POST_MEDIA}</span>
              </label>
              <div className="media-strip">
                {draft.media.map((url, i) => (
                  <div key={url} className={`media-thumb ${i === 0 ? "media-thumb-cover" : ""}`}>
                    <img src={url} alt={i === 0 ? "Cover photo" : `Photo ${i + 1}`} />
                    {i === 0 ? (
                      draft.media.length > 1 && <span className="media-cover-tag">COVER</span>
                    ) : (
                      <button
                        type="button"
                        className="media-thumb-x"
                        style={{ top: "auto", bottom: 4, left: 4, right: "auto", width: "auto", padding: "2px 7px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}
                        aria-label={`Make photo ${i + 1} the cover`}
                        onClick={() => { haptics.selection(); patch({ media: promoteMediaToCover(draft.media, i) }); }}
                      >
                        COVER?
                      </button>
                    )}
                    <button
                      type="button"
                      className="media-thumb-x"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => patch({ media: removeMediaAt(draft.media, i) })}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {canAddMedia(draft.media) && (
                  <>
                    <button
                      type="button"
                      className="media-add"
                      disabled={uploading}
                      onClick={() => cameraRef.current?.click()}
                    >
                      <Camera size={20} />
                      <span>{uploading ? "Uploading…" : "Camera"}</span>
                    </button>
                    <button
                      type="button"
                      className="media-add"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Image size={20} />
                      <span>{uploading ? "Uploading…" : "Gallery"}</span>
                    </button>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={pickPhoto} />
              </div>
              {/* Alt text only appears once there's a photo to describe. */}
              {draft.media.length > 0 && (
                <input
                  className="input"
                  style={{ marginTop: 9, padding: "10px 14px", borderRadius: 12, fontSize: 13.5 }}
                  placeholder="Describe the photo (for screen readers)"
                  aria-label="Photo description for screen readers"
                  value={draft.imageAlt}
                  maxLength={200}
                  onChange={(e) => patch({ imageAlt: e.target.value })}
                />
              )}
            </div>

            {/* ---- BULK BUYING: campaign economics, in place of the
                six-type picker's type-specific modules ---- */}
            {isBulkBuying && (
              <div className="type-module">
                <div className="type-module-title"><Package size={13} /> Campaign details</div>
                <div className="col gap-12">
                  <div className="row gap-10">
                    <div className="grow">
                      <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Regular price (₹)</label>
                      <input className="input" inputMode="decimal" placeholder="1000" value={regularPrice} onChange={(e) => setRegularPrice(e.target.value.replace(/[^0-9.]/g, ""))} />
                    </div>
                    <div style={{ width: 130 }}>
                      <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Target qty</label>
                      <input className="input" inputMode="numeric" placeholder="10" value={campaignMoq} onChange={(e) => setCampaignMoq(e.target.value.replace(/[^0-9]/g, ""))} />
                    </div>
                  </div>

                  <div>
                    <div className="row between center-v" style={{ marginBottom: 6 }}>
                      <label className="tiny semi muted">Volume discounts (optional)</label>
                      <button
                        type="button"
                        className="tiny semi row gap-4"
                        style={{ background: "none", border: "none", color: "var(--brand-700)" }}
                        onClick={() => setCampaignTiers((p) => [...p, { minQty: 0, unitPrice: 0 }])}
                      >
                        <Plus size={12} /> Add tier
                      </button>
                    </div>
                    <div className="col gap-8">
                      {campaignTiers.map((tier, i) => (
                        <div key={i} className="row gap-8 center-v">
                          <input
                            className="input"
                            style={{ width: 90 }}
                            inputMode="numeric"
                            placeholder="Qty"
                            value={tier.minQty || ""}
                            onChange={(e) => {
                              const v = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0;
                              setCampaignTiers((p) => p.map((x, idx) => (idx === i ? { ...x, minQty: v } : x)));
                            }}
                          />
                          <span className="tiny muted">+ at</span>
                          <input
                            className="input grow"
                            inputMode="decimal"
                            placeholder="Unit price ₹"
                            value={tier.unitPrice || ""}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0;
                              setCampaignTiers((p) => p.map((x, idx) => (idx === i ? { ...x, unitPrice: v } : x)));
                            }}
                          />
                          {campaignTiers.length > 1 && (
                            <button type="button" className="icon-btn" onClick={() => setCampaignTiers((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove tier">
                              <Minus size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Available quota (optional)</label>
                    <input className="input" inputMode="numeric" placeholder="Total units you can supply" value={campaignQuota} onChange={(e) => setCampaignQuota(e.target.value.replace(/[^0-9]/g, ""))} />
                    <div className="tiny muted" style={{ marginTop: 4 }}>Informational for now — shown on the listing, not enforced automatically when someone pledges.</div>
                  </div>

                  <div>
                    <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Deposit to join (optional)</label>
                    <input className="input" inputMode="decimal" placeholder="e.g. 100 — leave blank for no deposit" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
                    <div className="tiny muted" style={{ marginTop: 4 }}>The minimum a pledger pays upfront to reserve their spot.</div>
                  </div>

                  <div>
                    <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Closing deadline (optional)</label>
                    <input type="datetime-local" className="input" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
                    <div className="tiny muted" style={{ marginTop: 4 }}>Closes automatically once this passes, or once it hits its target quantity — whichever comes first.</div>
                  </div>

                  <div>
                    <label className="tiny semi muted" style={{ display: "block", marginBottom: 6 }}>Fulfilment (optional)</label>
                    <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                      {(Object.keys(FULFILLMENT_LABELS) as FulfillmentType[]).map((ft) => (
                        <button
                          key={ft}
                          type="button"
                          className="chip"
                          style={campaignFulfillment === ft ? { background: "var(--brand-100)", color: "var(--brand-700)", border: "1.5px solid var(--brand-300)" } : undefined}
                          onClick={() => setCampaignFulfillment(campaignFulfillment === ft ? null : ft)}
                        >
                          {FULFILLMENT_LABELS[ft]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---- ALERT: how loud, and how long ---- */}
            {draft.type === "ALERT" && (
              <div className="type-module">
                <div className="type-module-title"><Megaphone size={13} /> How urgent is it?</div>
                <div className="opt-row" role="radiogroup" aria-label="Alert urgency">
                  {ALERT_SEVERITIES.map((s) => {
                    const on = draft.severity === s.value;
                    const activeClass = s.tone === "red" ? "active-red" : s.tone === "amber" ? "active-amber" : "active-info";
                    return (
                      <button
                        key={s.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={`opt-card ${on ? activeClass : ""}`}
                        onClick={() => { haptics.selection(); patch({ severity: s.value }); }}
                      >
                        <span className="opt-card-emoji" aria-hidden="true">{s.emoji}</span>
                        <span className="opt-card-label">{s.label}</span>
                        <span className="opt-card-hint">{s.hint}</span>
                      </button>
                    );
                  })}
                </div>
                {draft.severity && (
                  <p className="tiny muted" style={{ margin: "9px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
                    <Clock size={11} /> Clears from the feed automatically after {alertExpiryHours(draft.severity)} hours.
                  </p>
                )}
              </div>
            )}

            {/* ---- POLL: options + a closing time ---- */}
            {draft.type === "POLL" && (
              <div className="type-module">
                <div className="type-module-title">📊 Poll</div>
                <div className="col gap-8">
                  {draft.pollOptions.map((o, i) => (
                    <div key={i} className="row gap-8">
                      <input
                        className="input grow"
                        placeholder={`Option ${i + 1}`}
                        value={o}
                        aria-label={`Poll option ${i + 1}`}
                        onChange={(e) => patch({ pollOptions: draft.pollOptions.map((x, j) => (j === i ? e.target.value : x)) })}
                      />
                      {draft.pollOptions.length > MIN_POLL_OPTIONS && (
                        <button
                          className="icon-btn"
                          aria-label={`Remove option ${i + 1}`}
                          onClick={() => patch({ pollOptions: draft.pollOptions.filter((_, j) => j !== i) })}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {draft.pollOptions.length < MAX_POLL_OPTIONS && (
                    <button className="btn btn-ghost btn-sm" onClick={() => patch({ pollOptions: [...draft.pollOptions, ""] })}>
                      <Plus size={14} /> Add option
                    </button>
                  )}
                </div>
                {/* A poll that never closes never produces a result — and can't
                    tell its voters what won. */}
                <div style={{ marginTop: 13 }}>
                  <span className="compose-section-label" id="poll-duration-label">Voting closes in</span>
                  <div className="dur-row" role="radiogroup" aria-labelledby="poll-duration-label">
                    {POLL_DURATIONS.map((d) => (
                      <button
                        key={d.hours}
                        type="button"
                        role="radio"
                        aria-checked={draft.pollDurationHours === d.hours}
                        className={`chip-pill ${draft.pollDurationHours === d.hours ? "active" : ""}`}
                        onClick={() => { haptics.selection(); patch({ pollDurationHours: d.hours }); }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ---- LOST & FOUND: where, and any reward ---- */}
            {draft.type === "LOST_FOUND" && (
              <div className="type-module">
                <div className="type-module-title"><MapPin size={13} /> Where & reward</div>
                <div className="col gap-10">
                  <input
                    className="input"
                    placeholder="Last seen near… (e.g. the park gate)"
                    aria-label="Last seen location"
                    value={draft.lastSeen}
                    maxLength={120}
                    onChange={(e) => patch({ lastSeen: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Reward, if any (optional)"
                    aria-label="Reward"
                    value={draft.reward}
                    maxLength={80}
                    onChange={(e) => patch({ reward: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* ---- GIVEAWAY: how to collect it ---- */}
            {draft.type === "GIVEAWAY" && (
              <div className="type-module">
                <div className="type-module-title">🎁 Pickup</div>
                <input
                  className="input"
                  placeholder="When & how to collect (e.g. evenings after 6)"
                  aria-label="Pickup details"
                  value={draft.pickupNote}
                  maxLength={140}
                  onChange={(e) => patch({ pickupNote: e.target.value })}
                />
              </div>
            )}

            {/* ---- Post settings ----
                Collapsed by default (Instagram's "Advanced settings" pattern):
                the defaults are right for most posts, and putting four audience
                options in the main flow makes every post a decision. The
                collapsed row still states the current choice, so it's never a
                setting you have to open to know. Not applicable to a bulk-buying
                campaign — it's a bulk_deals row, not a community_posts row, and
                has no comment-policy/like-count concept at all. */}
            {!isBulkBuying && (
            <div className="field" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="row between center-v"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
                style={{ width: "100%", padding: "12px 14px", background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 14, cursor: "pointer", textAlign: "left" }}
              >
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="semi small">Post settings</span>
                  <span className="tiny muted ellipsis">
                    {policyMeta.emoji} {policyMeta.label} can reply
                    {draft.hideLikeCount ? " · likes hidden" : ""}
                  </span>
                </div>
                <ChevronDown
                  size={16}
                  color="var(--ink-500)"
                  style={{ flexShrink: 0, transform: settingsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
                />
              </button>

              {settingsOpen && (
                <div className="type-module" style={{ marginTop: 10 }}>
                  <div className="type-module-title"><MessageCircle size={13} /> Who can reply</div>
                  <div className="col gap-8" role="radiogroup" aria-label="Who can reply">
                    {COMMENT_POLICIES.map((p) => {
                      const on = draft.commentPolicy === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className="row gap-10 center-v"
                          style={{
                            width: "100%", padding: "10px 12px", textAlign: "left", cursor: "pointer",
                            borderRadius: 13,
                            border: on ? "1.5px solid var(--brand-600)" : "1.5px solid var(--ink-200)",
                            background: on ? "var(--brand-50)" : "var(--surface)",
                          }}
                          onClick={() => { haptics.selection(); patch({ commentPolicy: p.value }); }}
                        >
                          <span style={{ fontSize: 17 }} aria-hidden="true">{p.emoji}</span>
                          <span className="grow" style={{ minWidth: 0 }}>
                            <span className="semi small" style={{ display: "block", color: on ? "var(--brand-900)" : "var(--ink-900)" }}>{p.label}</span>
                            <span className="tiny muted">{p.hint}</span>
                          </span>
                          <span style={{
                            width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                            border: on ? "5px solid var(--brand-600)" : "2px solid var(--ink-300)",
                          }} />
                        </button>
                      );
                    })}
                  </div>

                  <div className="divider" style={{ margin: "13px 0" }} />

                  <button
                    type="button"
                    className="row between center-v"
                    onClick={() => patch({ hideLikeCount: !draft.hideLikeCount })}
                    aria-pressed={draft.hideLikeCount}
                    style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                  >
                    <span className="col" style={{ gap: 2 }}>
                      <span className="semi small">Hide like count</span>
                      <span className="tiny muted">People can still like it — the number stays private</span>
                    </span>
                    <span style={{
                      width: 44, height: 26, borderRadius: 999, flexShrink: 0, position: "relative",
                      background: draft.hideLikeCount ? "var(--brand-600)" : "var(--ink-300)",
                      transition: "background 0.15s ease",
                    }}>
                      <span style={{
                        position: "absolute", top: 3, left: draft.hideLikeCount ? 21 : 3,
                        width: 20, height: 20, borderRadius: "50%", background: "var(--white)",
                        transition: "left 0.15s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }} />
                    </span>
                  </button>
                </div>
              )}
            </div>
            )}

            {/* ---- ASK / SHOUTOUT: tag the place you mean ----
                A shoutout that names a business in prose is a dead end; tagging
                turns it into a link to that listing, which is the whole point of
                a shoutout on a local app. */}
            {(draft.type === "RECOMMENDATION" || draft.type === "SHOUTOUT") && (
              <div className="type-module">
                <div className="type-module-title"><Tag size={13} /> Tag a place {draft.type === "SHOUTOUT" ? "" : "(optional)"}</div>
                {draft.taggedListing ? (
                  <div className="row gap-10 center-v" style={{ padding: "9px 11px", background: "var(--surface)", border: "1px solid var(--ink-200)", borderRadius: 12 }}>
                    <span style={{ fontSize: 18 }} aria-hidden="true">{draft.taggedListing.listingType === "BUSINESS" ? "🏪" : "👤"}</span>
                    <span className="semi small grow ellipsis">{draft.taggedListing.name}</span>
                    <button
                      className="icon-btn"
                      aria-label="Remove tagged place"
                      style={{ width: 26, height: 26 }}
                      onClick={() => patch({ taggedListing: null })}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setTagPickerOpen(true)}>
                    <Tag size={14} /> Choose a business or provider
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="compose-footer">
        {sellerCtxLoading ? (
          <p className="compose-hint">Resolving your business/provider identity…</p>
        ) : isBulkBuying ? (
          !campaignValidation.ok && <p className="compose-hint" role="status">{campaignValidation.message}</p>
        ) : !validation.ok && draft.type ? (
          <p className="compose-hint" role="status">{validation.message}</p>
        ) : justSaved ? (
          <p style={{ margin: "0 0 8px", textAlign: "center" }}>
            <span className="draft-pill" role="status"><Check size={11} /> Draft saved</span>
          </p>
        ) : null}
        <div className="row gap-8">
          {/* Preview is offered only once the draft is actually postable —
              a preview of an invalid post would show a card that can't exist.
              Not offered for a campaign — it renders as a BulkDealCard, not
              the CommunityCard this preview builds. */}
          {!isBulkBuying && validation.ok && (
            <button
              className="btn btn-ghost"
              style={{ flexShrink: 0, border: "1.5px solid var(--ink-200)", fontWeight: 700 }}
              onClick={() => { haptics.light(); setPreviewOpen(true); }}
            >
              <Eye size={15} /> Preview
            </button>
          )}
          <button className="btn btn-primary grow" disabled={!canPost} onClick={isBulkBuying ? postCampaign : post}>
            {posting ? "Posting…" : isBulkBuying ? "Publish campaign" : "Post to your street"}
          </button>
        </div>
      </div>

      {/* Preview — the real CommunityCard, exactly as the feed will render it. */}
      {previewOpen && draft.type && (
        <div className="overlay" onClick={() => setPreviewOpen(false)}>
          <div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "86vh", display: "flex", flexDirection: "column" }}
            role="dialog"
            aria-modal="true"
            aria-label="Post preview"
          >
            <div className="sheet-grab" />
            <div className="compose-preview-note">
              <Eye size={13} /> This is how your post will appear in the feed
            </div>
            <div style={{ overflowY: "auto", flex: 1, margin: "0 -4px", padding: "0 4px 4px" }}>
              <div className="compose-preview">
                <CommunityCard
                  post={draftToPreviewPost(
                    draft,
                    {
                      authorName: identityName,
                      authorAvatar: sellerCtx?.avatar || user.avatar,
                      authorUserId: user.id,
                      authorType: sellerCtx?.type ?? "user",
                      authorRefId: sellerCtx?.id,
                    },
                    area
                  )}
                />
              </div>
            </div>
            <div className="col gap-8" style={{ marginTop: 14 }}>
              <button className="btn btn-primary btn-block" disabled={!canPost} onClick={post}>
                {posting ? "Posting…" : "Looks good — post it"}
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setPreviewOpen(false)}>Keep editing</button>
            </div>
          </div>
        </div>
      )}

      {succeeded && (
        <div className="post-success" role="status" aria-live="polite">
          <span className="post-success-ring">
            <Check size={38} weight="bold" />
          </span>
          <span className="post-success-label">Posted to {area || "your street"}</span>
        </div>
      )}

      {tagPickerOpen && (
        <ListingPickerSheet
          title={draft.type === "SHOUTOUT" ? "Who's the shoutout for?" : "Tag a place"}
          onPick={(picked) => {
            haptics.selection();
            patch({ taggedListing: picked });
            setTagPickerOpen(false);
          }}
          onClose={() => setTagPickerOpen(false)}
        />
      )}

      {leaveConfirm && (
        <div className="overlay" onClick={() => setLeaveConfirm(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h2 className="h2" style={{ marginBottom: 6 }}>Keep this draft?</h2>
            <p className="small muted" style={{ marginBottom: "var(--space-md)", lineHeight: 1.5 }}>
              We can hold on to what you've written and bring it back next time you post.
            </p>
            <div className="col gap-8">
              <button className="btn btn-primary btn-block" onClick={() => nav(-1)}>Save draft</button>
              <button
                className="btn btn-block"
                style={{ background: "var(--red-500)", color: "var(--white)" }}
                onClick={() => { discard(); nav(-1); }}
              >
                Discard
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setLeaveConfirm(false)}>Keep editing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
