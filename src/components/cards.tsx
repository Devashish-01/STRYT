import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MapPin, Clock, BadgeCheck, Zap, Eye, Users, Flame, Repeat, MessageCircle, CheckCircle2 } from "@/components/Icons";
import type { Business, Provider, RequestPost, CommunityPost, CommunityPostType, BookmarkTarget } from "@/types";
import { Rating, inr, SafeImg } from "./common";
import { useApp } from "@/store";
import { evaluateProviderAvailability } from "@/utils/availability";
import { displayName as safeName } from "@/lib/publicName";
import { distanceLabel } from "@/lib/format";
import { openProfile } from "@/lib/profileSheet";
import { GROUP_BUY_PROGRESS_ENABLED } from "@/utils/constants";
import { REQUEST_STATUS_BADGE } from "@/lib/statusBadges";
import { communityService, discoveryService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { resolveRecommendations, type ResolvedRecommendation } from "@/lib/communityRecommendations";
import { haptics } from "@/lib/haptics";

/* ---------------- Business cards ---------------- */

export function BusinessCardWide({ b, style, entranceClass = "fade-up" }: { b: Business; style?: CSSProperties; entranceClass?: string }) {
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark, isGuest } = useApp();
  const saved = isBookmarked("BUSINESS", b.id);
  // Live open/closed from the owner's presence toggle + working hours — same
  // evaluator BusinessDetail uses, so the card can't show a stale "Open".
  const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
  return (
    <div className={`card card-interactive ${entranceClass}`} style={{ overflow: "hidden", ...style }} onClick={() => nav(`/business/${b.id}`)}>
      <div style={{ position: "relative" }}>
        <img src={b.coverImage} alt={b.name} className="thumb" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover" }} loading="lazy" />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent 55%)",
          }}
        />
        {b.offerText && (
          <div
            style={{
              position: "absolute",
              left: 10,
              bottom: 10,
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
              textShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }}
          >
            {b.offerText}
          </div>
        )}
        {/* Saving needs an account to save to — guests view only. */}
        {!isGuest && (
          <button
            className="icon-btn"
            style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.92)" }}
            onClick={(e) => {
              e.stopPropagation();
              haptics.selection();
              toggleBookmark("BUSINESS", b.id);
            }}
            aria-label="Save"
          >
            <Heart size={18} fill={saved ? "var(--red-500)" : "none"} color={saved ? "var(--red-500)" : "var(--ink-600)"} />
          </button>
        )}
        {/* Paid-placement transparency: users must be able to tell boosted results apart. */}
        {(b.isNew || b.isBoosted) && (
          <div className="card-badge-stack">
            {b.isNew && <span className="badge badge-new">● NEW</span>}
            {b.isBoosted && <span className="badge badge-amber">Promoted</span>}
          </div>
        )}
      </div>
      <div style={{ padding: "var(--space-sm)" }}>
        <div className="row between">
          <div className="row gap-6" style={{ minWidth: 0 }}>
            <span className="bold ellipsis" style={{ fontSize: 16 }}>{b.name}</span>
            {b.isVerified && <BadgeCheck size={16} color="var(--brand-600)" fill="var(--brand-100)" />}
          </div>
          <Rating value={b.ratingAvg} />
        </div>
        <div className="tiny muted ellipsis tabular-nums" style={{ marginTop: 3 }}>
          {b.subCategory} {b.priceForTwo ? `• ${inr(b.priceForTwo)} for two` : ""}
        </div>
        <div className="row gap-10 tiny muted" style={{ marginTop: "var(--space-xs)" }}>
          <span className="row gap-4"><MapPin size={13} /> {distanceLabel(b.distanceKm)}</span>
          {b.deliveryTime && <span className="row gap-4"><Clock size={13} /> {b.deliveryTime}</span>}
          <span className={`badge ${evalRes.isOpenNow ? "badge-green" : "badge-gray"}`} style={{ fontSize: 10, padding: "1px 6px" }}>
            {evalRes.isOpenNow ? "Open" : "Closed"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function BusinessCardSmall({ b, style, entranceClass = "fade-up" }: { b: Business; style?: CSSProperties; entranceClass?: string }) {
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark, isGuest } = useApp();
  const saved = isBookmarked("BUSINESS", b.id);
  const evalRes = evaluateProviderAvailability(b.hours, b.isAvailableNow, b.availableUntil);
  return (
    <div
      className={`card-interactive ${entranceClass}`}
      style={{ width: 160, flexShrink: 0, ...style }}
      onClick={() => nav(`/business/${b.id}`)}
    >
      <div style={{ position: "relative" }}>
        <img src={b.coverImage} alt={b.name} className="thumb" style={{ width: "100%", aspectRatio: "16/11", borderRadius: "var(--radius)", objectFit: "cover" }} loading="lazy" />
        {b.offerText && (
          <div
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              right: 8,
              color: "#fff",
              fontWeight: 800,
              fontSize: 12,
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
            className="ellipsis"
          >
            {b.offerText}
          </div>
        )}
        {!isGuest && (
          <button
            className="icon-btn"
            style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, background: "rgba(255,255,255,0.92)" }}
            onClick={(e) => {
              e.stopPropagation();
              haptics.selection();
              toggleBookmark("BUSINESS", b.id);
            }}
            aria-label="Save"
          >
            <Heart size={14} fill={saved ? "var(--red-500)" : "none"} color={saved ? "var(--red-500)" : "var(--ink-600)"} />
          </button>
        )}
        {(b.isNew || b.isBoosted) && (
          <div className="card-badge-stack" style={{ top: 8, left: 8, gap: "var(--space-xxs)" }}>
            {b.isNew && <span className="badge badge-new" style={{ fontSize: 10 }}>NEW</span>}
            {b.isBoosted && <span className="badge badge-amber" style={{ fontSize: 10 }}>Promoted</span>}
          </div>
        )}
      </div>
      <div style={{ marginTop: 7 }}>
        <div className="row between gap-6">
          <span className="bold ellipsis small">{b.name}</span>
        </div>
        <div className="row gap-6" style={{ marginTop: 3 }}>
          <Rating value={b.ratingAvg} size={11} />
          <span className="tiny muted ellipsis">{distanceLabel(b.distanceKm)}</span>
        </div>
        <span className={`badge ${evalRes.isOpenNow ? "badge-green" : "badge-gray"}`} style={{ fontSize: 9, padding: "1px 6px" }}>
          {evalRes.isOpenNow ? "Open" : "Closed"}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Provider card ---------------- */

export function ProviderCard({ p, style, entranceClass = "fade-up" }: { p: Provider; style?: CSSProperties; entranceClass?: string }) {
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark, isGuest } = useApp();
  const saved = isBookmarked("PROVIDER", p.id);
  const evalRes = evaluateProviderAvailability(p.availabilityNote, p.isAvailableNow, p.availableUntil);
  return (
    <div className={`card card-interactive ${entranceClass}`} style={{ padding: "var(--space-sm)", ...style }} onClick={() => nav(`/provider/${p.id}`)}>
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <div style={{ position: "relative" }}>
          <SafeImg
            src={p.avatar}
            alt={p.displayName}
            variant="avatar"
            className="avatar"
            style={{ width: 56, height: 56, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              openProfile(p.id, "PROVIDER", { name: p.displayName, avatar: p.avatar });
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: evalRes.isOpenNow ? "var(--green-500)" : "var(--ink-400)",
              border: "2px solid #fff",
            }}
          />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between">
            <div className="row gap-6" style={{ minWidth: 0 }}>
              <span className="bold ellipsis" style={{ fontSize: 15 }}>{safeName(p.displayName, "Local provider")}</span>
              {p.isVerified && <BadgeCheck size={15} color="var(--brand-600)" fill="var(--brand-100)" />}
            </div>
            {!isGuest && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.selection();
                  toggleBookmark("PROVIDER", p.id);
                }}
                aria-label="Save"
              >
                <Heart size={18} fill={saved ? "var(--red-500)" : "none"} color={saved ? "var(--red-500)" : "var(--ink-400)"} />
              </button>
            )}
          </div>
          <div className="tiny muted" style={{ marginTop: 1 }}>{p.categoryName} • {p.subCategory}</div>
          <div className="row gap-8 center-v" style={{ marginTop: 6 }}>
            <Rating value={p.ratingAvg} size={11} />
            {p.jobsDone > 0 && <span className="tiny muted">{p.jobsDone} jobs</span>}
            <span className="tiny muted">• {distanceLabel(p.distanceKm)}</span>
            <span
              className={`badge ${evalRes.isOpenNow ? "badge-green" : "badge-gray"}`}
              style={{ fontSize: 10, padding: "1px 6px", marginLeft: "auto" }}
            >
              {evalRes.isOpenNow ? "Available" : "Offline"}
            </span>
          </div>
        </div>
      </div>
      <div className="row wrap gap-6" style={{ marginTop: 10 }}>
        {p.skills.slice(0, 3).map((s) => (
          <span key={s} className="badge badge-gray">{s}</span>
        ))}
      </div>
      <div className="row between" style={{ marginTop: 11 }}>
        <div>
          <span className="tiny muted">Starts at </span>
          <span className="bold tabular-nums" style={{ color: "var(--green-500)" }}>{inr(p.startingPrice)}</span>
        </div>
        {p.responseTime && <span className="tiny muted row gap-4"><Clock size={12} /> Responds {p.responseTime}</span>}
      </div>
    </div>
  );
}

export function ProviderCardSmall({ p, style, entranceClass = "fade-up" }: { p: Provider; style?: CSSProperties; entranceClass?: string }) {
  const nav = useNavigate();
  const { isBookmarked, toggleBookmark, isGuest } = useApp();
  const saved = isBookmarked("PROVIDER", p.id);
  return (
    <div
      className={`card card-interactive ${entranceClass}`}
      style={{
        width: 154,
        flexShrink: 0,
        padding: 14,
        borderRadius: 16,
        position: "relative",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)",
        border: "1px solid var(--line)",
        ...style
      }}
      onClick={() => nav(`/provider/${p.id}`)}
    >
      {!isGuest && (
        <button
          className="icon-btn"
          style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, background: "rgba(255, 255, 255, 0.92)", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}
          onClick={(e) => {
            e.stopPropagation();
            haptics.selection();
            toggleBookmark("PROVIDER", p.id);
          }}
          aria-label="Save"
        >
          <Heart size={13} fill={saved ? "var(--red-500)" : "none"} color={saved ? "var(--red-500)" : "var(--ink-400)"} />
        </button>
      )}
      <div className="col center" style={{ textAlign: "center", gap: 6 }}>
        <SafeImg src={p.avatar} alt={p.displayName} variant="avatar" className="avatar" style={{ width: 60, height: 60, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }} />
        <div className="bold small ellipsis" style={{ maxWidth: "100%", fontSize: 13.5 }}>{safeName(p.displayName, "Local provider")}</div>
        <div className="tiny muted ellipsis" style={{ maxWidth: "100%", fontSize: 11 }}>{p.categoryName}</div>
        <Rating value={p.ratingAvg} size={11} />
        <div className="tiny tabular-nums" style={{ color: "var(--green-500)", fontWeight: 700, marginTop: 1 }}>from {inr(p.startingPrice)}</div>
      </div>
    </div>
  );
}

/* ---------------- Request card ---------------- */

/** "Expires in 2h 10m" — poster + responders both need urgency visibility. */
function expiryLabel(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null; // sweep will flip status shortly
  const m = Math.floor(ms / 60000);
  if (m < 60) return `Expires in ${m}m`;
  return `Expires in ${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
}

export function RequestCard({ r, style }: { r: RequestPost; style?: CSSProperties }) {
  const nav = useNavigate();
  const { meToos } = useApp();
  const expiry = r.status === "OPEN" ? expiryLabel(r.expiresAt) : null;
  const budget =
    r.budgetMin && r.budgetMax ? `${inr(r.budgetMin)}–${inr(r.budgetMax)}` : "Open budget";
  const meTooed = meToos.includes(r.id) || r.meTooed;
  const meTooCount = (r.meTooCount ?? 0) + (meTooed && !r.meTooed ? 1 : 0);
  const isOpen = r.status === "OPEN";
  const statusBadge = REQUEST_STATUS_BADGE[r.status] ?? null;
  const archived = r.status === "EXPIRED" || r.status === "CANCELLED";
  return (
    <div
      className="card card-interactive fade-up"
      style={{ padding: 14, border: r.isUrgent && isOpen ? "1.5px solid var(--red-100)" : undefined, opacity: archived ? 0.62 : 1, ...style }}
      onClick={() => nav(`/request/${r.id}`)}
    >
      <div className="row gap-10" style={{ alignItems: "flex-start" }}>
        <SafeImg src={r.requesterAvatar} alt={r.requesterName} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between">
            <span className="semi small">{r.isAnonymous ? "Someone nearby" : r.requesterName}</span>
            <span className="tiny muted">{r.postedAt}</span>
          </div>
          <div className="row gap-6 tiny muted">
            <MapPin size={12} /> {r.area}{r.distanceKm > 0 ? ` • ${r.distanceKm} km away` : ""}
          </div>
        </div>
      </div>

      <div className="row gap-8" style={{ marginTop: 10, alignItems: "flex-start" }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row wrap gap-6" style={{ marginBottom: 4 }}>
            {statusBadge && <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>}
            {isOpen && r.isUrgent && <span className="badge badge-red"><Flame size={11} /> Urgent</span>}
            {isOpen && r.isBoosted && <span className="badge badge-amber"><Zap size={11} /> Boosted</span>}
            {r.isGroupBuy && <span className="badge badge-green"><Users size={11} /> Group buy</span>}
            {r.isRecurring && <span className="badge badge-blue"><Repeat size={11} /> Recurring</span>}
            <span className="badge badge-purple">{r.categoryName}</span>
            {r.subCategory && <span className="badge badge-gray">{r.subCategory}</span>}
            {expiry && <span className="badge badge-amber">⏳ {expiry}</span>}
          </div>
          <div className="bold" style={{ fontSize: 15.5 }}>{r.title}</div>
          <p className="small muted clamp-2" style={{ marginTop: 4, lineHeight: 1.45 }}>{r.description}</p>
        </div>
        {r.photos[0] && (
          <img src={r.photos[0]} alt="" className="thumb" style={{ width: 64, height: 64, borderRadius: 12 }} loading="lazy" />
        )}
      </div>

      {/* Group buy progress — hidden while GROUP_BUY_PROGRESS_ENABLED is off */}
      {GROUP_BUY_PROGRESS_ENABLED && r.isGroupBuy && r.groupBuyTarget && (
        <div style={{ marginTop: 10 }}>
          <div className="row between tiny" style={{ marginBottom: 4 }}>
            <span className="semi" style={{ color: "var(--green-500)" }}>{meTooCount} of {r.groupBuyTarget} joined</span>
            <span className="muted">unlocks bulk price</span>
          </div>
          <div style={{ height: 7, borderRadius: 6, background: "var(--ink-100)", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (meTooCount / r.groupBuyTarget) * 100)}%`, height: "100%", background: "linear-gradient(90deg,var(--green-500),var(--green-500))" }} />
          </div>
        </div>
      )}

      <div className="divider" style={{ margin: "12px 0" }} />

      <div className="row between">
        <div className="col" style={{ gap: 2 }}>
          <span className="tiny muted">Budget</span>
          <span className="bold tabular-nums" style={{ color: "var(--green-500)" }}>{budget}</span>
        </div>
        {GROUP_BUY_PROGRESS_ENABLED && !isOpen && meTooCount > 0 && (
          <span className="row gap-4 tiny muted" style={{ alignItems: "center" }}>
            <Users size={13} /> {meTooCount} interested
          </span>
        )}
        <div className="col" style={{ gap: 2, alignItems: "flex-end" }}>
          <span className="tiny muted row gap-4"><Eye size={11} /> {r.viewCount}</span>
          <span className="semi small" style={{ color: "var(--brand-700)" }}>
            {r.proposals.length} {r.proposals.length === 1 ? "offer" : "offers"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Community card ---------------- */

const COMMUNITY_TYPE_META: Record<CommunityPostType, { label: string; emoji: string; tone: string }> = {
  LOST_FOUND: { label: "Lost & Found", emoji: "🔍", tone: "amber" },
  ALERT: { label: "Alert", emoji: "📢", tone: "red" },
  RECOMMENDATION: { label: "Ask neighbors", emoji: "💬", tone: "purple" },
  GIVEAWAY: { label: "Giveaway", emoji: "🎁", tone: "green" },
  POLL: { label: "Poll", emoji: "📊", tone: "blue" },
  SHOUTOUT: { label: "Shoutout", emoji: "🙌", tone: "purple" },
};

export function CommunityCard({ post, onRefetch }: { post: CommunityPost; onRefetch?: () => void }) {
  const nav = useNavigate();
  const { votes, votePoll, user, showToast, isGuest } = useApp();
  const [recommendOpen, setRecommendOpen] = useState(false);
  const M = COMMUNITY_TYPE_META[post.type];
  // Optimistic override for THIS card only, cleared once the server-confirmed
  // value (post.liked/post.likes) catches up — avoids XOR-ing against a value
  // that a realtime refetch can change out from under a session-wide toggle
  // (that was making the like visually revert; see GOAL_LIVE_AUDIT.md #8).
  const [likeOverride, setLikeOverride] = useState<boolean | null>(null);
  useEffect(() => { setLikeOverride(null); }, [post.liked, post.likes]);
  const liked = likeOverride ?? post.liked;
  const likeCount = Math.max(0, post.likes + (likeOverride === true && !post.liked ? 1 : 0) - (likeOverride === false && post.liked ? 1 : 0));
  const votedOption = votes[post.id] ?? post.votedOptionId;
  const totalVotes = (post.pollOptions?.reduce((s, o) => s + o.votes, 0) ?? 0) + (votedOption && !post.votedOptionId ? 1 : 0);

  // Optimistic override so a new recommendation shows immediately instead of
  // waiting on a full parent refetch — same shape as likeOverride above.
  const [recsOverride, setRecsOverride] = useState<CommunityPost["recommendations"] | null>(null);
  useEffect(() => { setRecsOverride(null); }, [post.recommendations]);
  const displayRecs = recsOverride ?? post.recommendations;

  // Looked up by id directly (not searched against a pre-fetched "nearby"
  // list) — a recommended listing isn't guaranteed to be within the current
  // viewer's own discovery radius. See src/lib/communityRecommendations.ts.
  const { data: recNames } = useQuery<Record<string, ResolvedRecommendation>>(
    () => (displayRecs && displayRecs.length > 0) ? resolveRecommendations(displayRecs) : Promise.resolve({}),
    [post.id, displayRecs?.map((r) => r.listingId).join(",")]
  );

  // Guests never reach these — the controls that call them are hidden below —
  // but they stay guarded at the render site rather than here so the handlers
  // remain plain, single-purpose functions for signed-in users.
  function handleLike() {
    const next = !liked;
    haptics.selection();
    setLikeOverride(next); // optimistic
    communityService.like(post.id, liked).catch(() => {
      setLikeOverride(liked); // revert so the UI never lies
      showToast("Couldn't update like — try again");
    });
  }

  function handleVote(optId: string) {
    if (votedOption) return;
    haptics.selection();
    votePoll(post.id, optId); // optimistic
    communityService.vote(post.id, optId).catch(() => {
      showToast("Couldn't record your vote — try again");
    });
  }

  async function handleRecommend(listingType: BookmarkTarget, listingId: string) {
    setRecommendOpen(false);
    haptics.medium();
    const byName = safeName(user.name, "A neighbor");
    const type = listingType as "BUSINESS" | "PROVIDER";
    setRecsOverride([...(post.recommendations ?? []), { listingType: type, listingId, byName }]); // optimistic
    try {
      await communityService.recommendListing(post.id, type, listingId, byName);
      haptics.success();
      onRefetch?.();
    } catch {
      setRecsOverride(null); // revert so the UI never lies
      showToast("Couldn't add recommendation — try again");
    }
  }

  return (
    <>
      <div className="card queue-row-enter">
        <button className="row gap-10" style={{ width: "100%", textAlign: "left" }} onClick={() => nav(`/community/${post.id}`, { state: { post } })}>
          <SafeImg
            src={post.authorAvatar}
            variant={post.authorType === "business" ? "photo" : "avatar"}
            className="avatar"
            style={{
              width: 40, height: 40,
              border: post.authorType === "business" ? "2px solid var(--orange-500)" : post.authorType === "provider" ? "2px solid var(--green-500)" : "none",
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (post.authorType === "business" && post.authorRefId) {
                openProfile(post.authorRefId, "BUSINESS", { name: post.authorName, avatar: post.authorAvatar });
              } else if (post.authorType === "provider" && post.authorRefId) {
                openProfile(post.authorRefId, "PROVIDER", { name: post.authorName, avatar: post.authorAvatar });
              } else if (post.authorUserId) {
                openProfile(post.authorUserId, "USER", { name: post.authorName, avatar: post.authorAvatar });
              }
            }}
          />
          <div className="grow">
            <div className="row between">
              <span className="row gap-6 center-v">
                <span className="semi small">{post.authorName}</span>
                {post.authorType && post.authorType !== "user" && (
                  <span className={`badge ${post.authorType === "business" ? "badge-orange" : "badge-green"}`} style={{ fontSize: 9, padding: "2px 6px" }}>
                    {post.authorType === "business" ? "🏪 Business" : "🔧 Provider"}
                  </span>
                )}
              </span>
              <span className={`badge badge-${M.tone}`}>{M.emoji} {M.label}</span>
            </div>
            <span className="tiny muted row gap-4"><MapPin size={11} /> {post.area} • {post.postedAt}</span>
          </div>
        </button>

        <div className="bold" style={{ fontSize: 16, marginTop: 10 }}>
          {post.title}
          {post.resolved && <span className="badge badge-green" style={{ marginLeft: 8 }}><CheckCircle2 size={11} /> Resolved</span>}
        </div>
        <p className="small" style={{ marginTop: 5, lineHeight: 1.5, color: "var(--ink-700)" }}>{post.body}</p>

        {post.image && <SafeImg src={post.image} alt="" className="thumb" style={{ width: "100%", height: 180, borderRadius: 14, marginTop: 10 }} />}

        {/* Poll */}
        {post.type === "POLL" && post.pollOptions && (
          <div className="col gap-8" style={{ marginTop: 12 }}>
            {post.pollOptions.map((o) => {
              const voted = votedOption === o.id;
              const v = o.votes + (voted && !post.votedOptionId ? 1 : 0);
              const pct = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
              return (
                <button
                  key={o.id}
                  disabled={isGuest}
                  onClick={isGuest ? undefined : () => handleVote(o.id)}
                  style={{ position: "relative", textAlign: "left", padding: "11px 13px", borderRadius: 10, border: voted ? "1.5px solid var(--brand-500)" : "1.5px solid var(--ink-200)", overflow: "hidden", background: "#fff", cursor: isGuest ? "default" : "pointer", opacity: 1 }}
                >
                  {votedOption && <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: voted ? "var(--brand-100)" : "var(--ink-100)" }} />}
                  <div className="row between" style={{ position: "relative" }}>
                    <span className="small semi">{o.label}</span>
                    {votedOption && <span className="small semi" style={{ color: "var(--brand-700)" }}>{pct}%</span>}
                  </div>
                </button>
              );
            })}
            <span className="tiny muted">{totalVotes} votes</span>
          </div>
        )}

        {/* Recommendations */}
        {displayRecs && displayRecs.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 12 }}>
            {displayRecs.map((rec) => {
              const resolved = recNames?.[rec.listingId];
              return (
                <button key={rec.listingId} className="row gap-10" style={{ padding: 8, borderRadius: 12, background: "var(--ink-50)", textAlign: "left" }}
                  onClick={() => nav(rec.listingType === "BUSINESS" ? `/business/${rec.listingId}` : `/provider/${rec.listingId}`)}>
                  <SafeImg src={resolved?.image} variant={rec.listingType === "PROVIDER" ? "avatar" : "photo"} className="thumb" style={{ width: 44, height: 44, borderRadius: 10 }} />
                  <div className="grow">
                    <div className="semi small">{resolved?.name ?? "Loading…"}</div>
                    <div className="tiny muted">{resolved?.sub}</div>
                  </div>
                  <span className="tiny muted">↳ {rec.byName}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="divider" style={{ margin: "12px 0" }} />
        {/* Guests see the counts (social proof is the hook) but get no controls:
            the like button becomes plain text and Recommend disappears. Opening
            the post to read it is still allowed — that's viewing, not acting. */}
        <div className="row gap-16">
          {isGuest ? (
            <span className="row gap-6 small semi" style={{ color: "var(--ink-500)" }}>
              <Heart size={17} /> {likeCount}
            </span>
          ) : (
            <button className="row gap-6 small semi" style={{ color: liked ? "var(--red-500)" : "var(--ink-500)" }} onClick={handleLike}>
              <Heart size={17} fill={liked ? "var(--red-500)" : "none"} /> {likeCount}
            </button>
          )}
          <button className="row gap-6 small semi muted" onClick={() => nav(`/community/${post.id}`, { state: { post } })}>
            <MessageCircle size={17} /> {post.commentsCount} {post.commentsCount === 1 ? "comment" : "comments"}
          </button>
          {!isGuest && post.type === "RECOMMENDATION" && (
            <button className="row gap-6 small semi" style={{ marginLeft: "auto", color: "var(--brand-700)" }} onClick={() => setRecommendOpen(true)}>
              + Recommend
            </button>
          )}
        </div>
      </div>

      {/* Recommendation picker sheet */}
      {recommendOpen && (
        <RecommendSheet
          onPick={handleRecommend}
          onClose={() => setRecommendOpen(false)}
        />
      )}
    </>
  );
}

function RecommendSheet({ onPick, onClose }: {
  onPick: (type: BookmarkTarget, id: string) => void;
  onClose: () => void;
}) {
  const { user } = useApp();
  const [q, setQ] = useState("");
  const { data: bizPage } = useQuery(() => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: provPage } = useQuery(() => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const lq = q.toLowerCase();
  const filteredBiz = (bizPage?.data ?? []).filter((b) => b.name.toLowerCase().includes(lq));
  const filteredProv = (provPage?.data ?? []).filter((p) => p.displayName.toLowerCase().includes(lq));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
        <div className="sheet-grab" />
        <div className="bold" style={{ fontSize: 17, marginBottom: 12 }}>Recommend a place</div>
        <input className="input" placeholder="Search businesses or providers…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filteredBiz.map((b) => (
            <button key={b.id} className="row gap-12" style={{ width: "100%", padding: "10px 0", borderBottom: "1px solid var(--line)", textAlign: "left" }} onClick={() => onPick("BUSINESS", b.id)}>
              <SafeImg src={b.coverImage} className="thumb" style={{ width: 40, height: 40, borderRadius: 8 }} />
              <div className="grow"><div className="semi small">{b.name}</div><div className="tiny muted">{b.subCategory}</div></div>
            </button>
          ))}
          {filteredProv.map((p) => (
            <button key={p.id} className="row gap-12" style={{ width: "100%", padding: "10px 0", borderBottom: "1px solid var(--line)", textAlign: "left" }} onClick={() => onPick("PROVIDER", p.id)}>
              <SafeImg src={p.avatar} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
              <div className="grow"><div className="semi small">{safeName(p.displayName, "Local provider")}</div><div className="tiny muted">{p.categoryName}</div></div>
            </button>
          ))}
          {filteredBiz.length === 0 && filteredProv.length === 0 && (
            <p className="small muted center" style={{ padding: 24 }}>No results for "{q}"</p>
          )}
        </div>
      </div>
    </div>
  );
}
