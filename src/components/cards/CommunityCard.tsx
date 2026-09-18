import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MapPin, Clock, MessageCircle, CheckCircle2, ChevronRight, Bookmark, Share2, Flag, EyeOff, Ban, DotsThree, Pencil, Trash2 } from "@/components/Icons";
import type { Business, Provider, CommunityPost, BookmarkTarget } from "@/types";
import { SafeImg } from "../common";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { displayName as safeName } from "@/lib/publicName";
import { openProfile } from "@/lib/profileSheet";
import { communityService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { resolveRecommendations, type ResolvedRecommendation } from "@/lib/communityRecommendations";
import { haptics } from "@/lib/haptics";
import { COMMUNITY_TYPE_META } from "@/lib/communityTypes";
import { SEVERITY_TONE, isPollClosed, postMedia, severityMeta, timeLeftLabel } from "@/lib/communityPost";
import { DOUBLE_TAP_MS, doubleTapAction, isDoubleTap, muteTargetId, postShareSubtitle, type TapRecord } from "@/lib/postInteractions";
import ListingPickerSheet from "../ListingPickerSheet";
import ShareCard from "../ShareCard";
import ReportSheet from "../ReportSheet";
import { errorMessage } from "@/lib/errorMessage";

export function CommunityCard({ post, onRefetch, onHide, onMute }: {
  post: CommunityPost;
  onRefetch?: () => void;
  /** Feed asked to be told, so it can drop the row immediately. */
  onHide?: (postId: string) => void;
  onMute?: (authorId: string, authorName: string) => void;
}) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { votes, votePoll, user, showToast, isGuest } = useApp();
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Author lifecycle actions, previously reachable only by opening the post.
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolvedBusy, setResolvedBusy] = useState(false);
  const [resolvedOverride, setResolvedOverride] = useState<boolean | null>(null);
  // Same clear-only-when-the-server-agrees rule as likeOverride/saveOverride.
  useEffect(() => {
    if (resolvedOverride === null) return;
    if ((post.resolved ?? false) === resolvedOverride) setResolvedOverride(null);
  }, [post.resolved, resolvedOverride]);
  // Drives the burst overlay. Keyed by a counter rather than a boolean so a
  // second double-tap restarts the animation instead of being swallowed while
  // the first is still running.
  const [burst, setBurst] = useState(0);
  const lastTap = useRef<TapRecord | null>(null);
  const M = COMMUNITY_TYPE_META[post.type];
  // Optimistic override for THIS card only, cleared once the server-confirmed
  // value (post.liked/post.likes) catches up — avoids XOR-ing against a value
  // that a realtime refetch can change out from under a session-wide toggle
  // (that was making the like visually revert; see GOAL_LIVE_AUDIT.md #8).
  const [likeOverride, setLikeOverride] = useState<boolean | null>(null);
  // Clear the optimistic override only once realtime/refetch agrees with it —
  // resetting on every post.liked twitch was making likes visually revert.
  useEffect(() => {
    if (likeOverride === null) return;
    if (post.liked === likeOverride) setLikeOverride(null);
  }, [post.liked, post.likes, likeOverride]);
  // Same clear-only-when-the-server-agrees rule for saves.
  const [saveOverride, setSaveOverride] = useState<boolean | null>(null);
  useEffect(() => {
    if (saveOverride === null) return;
    if ((post.saved ?? false) === saveOverride) setSaveOverride(null);
  }, [post.saved, saveOverride]);
  const liked = likeOverride ?? post.liked;
  const likeCount = Math.max(0, post.likes + (likeOverride === true && !post.liked ? 1 : 0) - (likeOverride === false && post.liked ? 1 : 0));
  // The author sees their own tally even when they've hidden it from everyone
  // else — otherwise "hide like count" would hide it from the one person it's
  // feedback for.
  const isPostAuthor = !isGuest && !!user.id && post.authorUserId === user.id;
  const showLikeCount = !post.hideLikeCount || isPostAuthor;
  const saved = saveOverride ?? post.saved ?? false;
  const votedOption = votes[post.id] ?? post.votedOptionId;
  const totalVotes = (post.pollOptions?.reduce((s, o) => s + o.votes, 0) ?? 0) + (votedOption && !post.votedOptionId ? 1 : 0);
  // Photos read through postMedia() so a pre-migration row (single `image`, no
  // `media` array) renders identically to a new multi-photo one.
  const cardMedia = postMedia(post);
  const isResolved = resolvedOverride ?? post.resolved ?? false;
  // Same rule the detail screen uses: only these two types ever had an
  // outstanding thing to resolve. A poll or a shoutout never did.
  const canMarkResolved = isPostAuthor && (post.type === "LOST_FOUND" || post.type === "ALERT");
  const pollClosed = isPollClosed(post);
  const pollCountdown = post.type === "POLL" ? timeLeftLabel(post.pollEndsAt) : null;

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
    if (next) setBurst((n) => n + 1);
    communityService.like(post.id, liked).catch(() => {
      setLikeOverride(liked); // revert so the UI never lies
      showToast(t("card_like_failed"));
    });
  }

  /**
   * Double-tap anywhere on the card body to like it, the gesture people already
   * expect from a feed. Single-tap still opens the post, so this is layered on
   * top: the tap that opens the post is only committed if no second tap follows
   * inside the double-tap window.
   */
  function handleCardTap(e: React.MouseEvent) {
    const record: TapRecord = { time: Date.now(), x: e.clientX, y: e.clientY };
    const isSecond = isDoubleTap(lastTap.current, record);
    lastTap.current = isSecond ? null : record;

    if (!isSecond) {
      // Wait out the double-tap window before treating it as "open the post",
      // otherwise the first tap of a double-tap would navigate away.
      const scheduled = record;
      window.setTimeout(() => {
        if (lastTap.current === scheduled) {
          lastTap.current = null;
          nav(`/community/${post.id}`, { state: { post } });
        }
      }, DOUBLE_TAP_MS);
      return;
    }

    if (isGuest) {
      showToast(t("card_sign_in_to_like"));
      return;
    }
    // Never unlikes — see doubleTapAction. Replays the burst instead, so the
    // gesture always feels acknowledged.
    if (doubleTapAction(liked) === "LIKE") {
      handleLike();
    } else {
      haptics.light();
      setBurst((n) => n + 1);
    }
  }

  function handleSave() {
    const next = !saved;
    haptics.selection();
    setSaveOverride(next); // optimistic
    communityService.toggleSave(post.id, saved).then(() => {
      showToast(next ? "Saved" : "Removed from saved");
    }).catch(() => {
      setSaveOverride(saved); // revert so the UI never lies
      showToast("Couldn't save — try again");
    });
  }

  // Tapping your current choice retracts it, tapping another switches — the
  // same rule as the detail screen, so a mis-tap isn't permanent on whichever
  // surface it happened.
  function handleVote(optId: string) {
    const previous = votedOption ?? null;
    const next = previous === optId ? null : optId;
    haptics.selection();
    votePoll(post.id, next); // optimistic
    const call = next === null ? communityService.clearVote(post.id) : communityService.vote(post.id, next);
    call
      .then(() => onRefetch?.())
      .catch(() => {
        votePoll(post.id, previous); // revert so the bars never lie
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
      <div className="card community-card-squircle queue-row-enter" style={{ position: "relative" }}>
        {/* Double-tap burst. Keyed so a repeat gesture restarts it. */}
        {burst > 0 && (
          <span key={burst} className="like-burst" aria-hidden="true">
            <Heart size={78} weight="fill" color="var(--red-500)" />
          </span>
        )}
        <button className="row gap-12" style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0 }} onClick={handleCardTap}>
          <SafeImg
            src={post.authorAvatar}
            variant={post.authorType === "business" ? "photo" : "avatar"}
            className="avatar"
            style={{
              width: 44, height: 44, borderRadius: "50%",
              border: post.authorType === "business" ? "2px solid var(--orange-500)" : post.authorType === "provider" ? "2px solid var(--green-500)" : "2px solid var(--ink-200)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)", flexShrink: 0
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
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row between gap-6 center-v">
              <span className="row gap-6 center-v" style={{ minWidth: 0 }}>
                <span className="semi ellipsis" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)" }}>{post.authorName}</span>
                {post.authorType && post.authorType !== "user" && (
                  <span className={`badge ${post.authorType === "business" ? "badge-orange" : "badge-green"}`} style={{ fontSize: 10.5, padding: "2.5px 8px", borderRadius: 8, fontWeight: 600 }}>
                    {post.authorType === "business" ? "🏪 Business" : "🔧 Provider"}
                  </span>
                )}
              </span>
              {/* An alert's severity replaces the generic type badge — "🚨 Urgent"
                  says more at a glance than "📢 Alert", and it's the one thing a
                  scanner needs from an alert. */}
              {post.type === "ALERT" && post.severity ? (
                <span className={`badge badge-${SEVERITY_TONE[post.severity]}`} style={{ fontSize: 11.5, padding: "3.5px 10px", borderRadius: 12, fontWeight: 700, letterSpacing: "-0.1px" }}>
                  {severityMeta(post.severity).emoji} {severityMeta(post.severity).label}
                </span>
              ) : (
                <span className={`badge badge-${M.tone}`} style={{ fontSize: 11.5, padding: "3.5px 10px", borderRadius: 12, fontWeight: 600, letterSpacing: "-0.1px" }}>{M.emoji} {M.label}</span>
              )}
            </div>
            <span className="tiny muted row gap-4 center-v" style={{ marginTop: 3, fontSize: 12 }}><MapPin size={11} /> {post.area} • {post.postedAt}</span>
          </div>
        </button>

        {/* Overflow. Absolutely positioned so it sits outside the double-tap
            target — a menu that likes the post when you miss it is worse than
            no menu. */}
        {!isGuest && (
          <button
            className="icon-btn"
            aria-label={t("card_more_options")}
            style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, color: "var(--ink-500)" }}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
          >
            <DotsThree size={20} />
          </button>
        )}

        <button
          className="bold"
          style={{ fontSize: 17, marginTop: 14, letterSpacing: "-0.3px", lineHeight: 1.3, color: "var(--ink-900)", display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          onClick={handleCardTap}
        >
          {post.title}
          {isResolved && <span className="badge badge-green" style={{ marginLeft: 8, fontSize: 10.5, padding: "2.5px 8px", borderRadius: 8 }}><CheckCircle2 size={11} /> Resolved</span>}
        </button>
        {/* Clamped to 4 lines — MAX_BODY_LEN is 2000 chars, and an unclamped
            body could occupy the whole viewport for one verbose post. A real
            <button>, not a styled <p>, so it's keyboard/screen-reader
            reachable the same way the title and author row already are.
            Tapping the (possibly truncated) text opens the full post. */}
        {post.body && (
          <button
            className="small clamp-4"
            style={{ marginTop: 8, lineHeight: 1.6, color: "var(--ink-700)", fontSize: 15, display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}
            onClick={handleCardTap}
          >
            {post.body}
          </button>
        )}

        {/* Structured per-type detail. These used to be buried in the body text
            where they couldn't be scanned; now they read as facts. */}
        {(post.lastSeen || post.reward || post.pickupNote) && (
          <div className="col gap-4" style={{ marginTop: 10 }}>
            {post.lastSeen && (
              <span className="tiny row gap-5 center-v" style={{ color: "var(--ink-700)", fontSize: 12.5 }}>
                <MapPin size={12} color="var(--amber-700)" /> Last seen near <span className="semi">{post.lastSeen}</span>
              </span>
            )}
            {post.reward && (
              <span className="tiny row gap-5 center-v" style={{ color: "var(--ink-700)", fontSize: 12.5 }}>
                <span aria-hidden="true">🎁</span> Reward: <span className="semi">{post.reward}</span>
              </span>
            )}
            {post.pickupNote && (
              <span className="tiny row gap-5 center-v" style={{ color: "var(--ink-700)", fontSize: 12.5 }}>
                <Clock size={12} color="var(--green-600)" /> Pickup: <span className="semi">{post.pickupNote}</span>
              </span>
            )}
          </div>
        )}

        {/* The place the AUTHOR tagged — a tappable listing, not a name in prose. */}
        {post.taggedListing && (
          <button
            className="row gap-8 center-v"
            style={{ marginTop: 10, padding: "7px 11px", borderRadius: 12, background: "var(--brand-50)", border: "1px solid var(--brand-200)", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              nav(post.taggedListing!.listingType === "BUSINESS" ? `/business/${post.taggedListing!.listingId}` : `/provider/${post.taggedListing!.listingId}`);
            }}
          >
            <span style={{ fontSize: 14 }} aria-hidden="true">{post.taggedListing.listingType === "BUSINESS" ? "🏪" : "👤"}</span>
            <span className="tiny semi ellipsis" style={{ color: "var(--brand-800)", fontSize: 12.5 }}>{post.taggedListing.name}</span>
            <ChevronRight size={12} color="var(--brand-600)" />
          </button>
        )}

        {cardMedia.length > 0 && (
          <button
            style={{ position: "relative", display: "block", width: "100%", padding: 0, border: "1px solid var(--ink-200)", borderRadius: 16, overflow: "hidden", marginTop: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.03)", cursor: "pointer", background: "transparent" }}
            onClick={() => nav(`/community/${post.id}`, { state: { post } })}
            aria-label={post.imageAlt || (cardMedia.length > 1 ? `${cardMedia.length} photos` : "Post photo")}
          >
            <SafeImg
              src={cardMedia[0]}
              alt={post.imageAlt || ""}
              className="thumb"
              style={{ width: "100%", maxHeight: 240, height: 220, objectFit: "cover", display: "block" }}
            />
            {/* Multi-photo posts say so rather than hiding the rest behind a tap
                nothing hints at. */}
            {cardMedia.length > 1 && (
              <span
                className="tiny semi"
                style={{ position: "absolute", top: 10, right: 10, padding: "3px 9px", borderRadius: 10, color: "var(--white)", background: "rgba(26, 21, 48, 0.72)", backdropFilter: "blur(4px)", fontSize: 11.5 }}
              >
                1/{cardMedia.length}
              </span>
            )}
          </button>
        )}

        {/* Poll */}
        {post.type === "POLL" && post.pollOptions && (
          <div className="col gap-8" style={{ marginTop: 14 }}>
            {post.pollOptions.map((o) => {
              const voted = votedOption === o.id;
              const v = o.votes + (voted && !post.votedOptionId ? 1 : 0);
              const pct = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
              return (
                <button
                  key={o.id}
                  disabled={isGuest || pollClosed}
                  onClick={isGuest || pollClosed ? undefined : () => handleVote(o.id)}
                  style={{
                    position: "relative", textAlign: "left", height: 44, padding: "0 16px", borderRadius: 14,
                    border: voted ? "1.5px solid var(--brand-500)" : "1.5px solid var(--ink-200)",
                    overflow: "hidden", background: "var(--surface)", cursor: isGuest || pollClosed ? "default" : "pointer",
                    boxShadow: voted ? "0 2px 10px rgba(232, 62, 160, 0.18)" : "none",
                    transition: "transform 0.15s ease, border-color 0.2s ease",
                    display: "flex", alignItems: "center"
                  }}
                >
                  {votedOption && (
                    <div
                      style={{
                        position: "absolute", inset: 0, width: `${pct}%`,
                        background: voted ? "linear-gradient(90deg, var(--brand-100), var(--brand-50))" : "var(--ink-100)",
                        transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                        borderRadius: 12
                      }}
                    />
                  )}
                  <div className="row between grow" style={{ position: "relative", zIndex: 1 }}>
                    <span className="small semi" style={{ color: voted ? "var(--brand-900)" : "var(--ink-800)", fontSize: 13.5 }}>
                      {o.label} {voted && <CheckCircle2 size={13} style={{ display: "inline", verticalAlign: "middle", marginLeft: 4 }} color="var(--brand-600)" />}
                    </span>
                    {votedOption && <span className="small bold tabular-nums" style={{ color: "var(--brand-700)" }}>{pct}%</span>}
                  </div>
                </button>
              );
            })}
            {/* A poll with no visible deadline reads as "I'll vote later" and
                never gets voted on. */}
            <span className="row between center-v" style={{ marginLeft: 2 }}>
              <span className="tiny muted semi" style={{ fontSize: 12 }}>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</span>
              {pollCountdown && (
                <span
                  className="tiny semi row gap-4 center-v"
                  style={{
                    fontSize: 11.5,
                    color: pollClosed ? "var(--ink-500)" : "var(--brand-700)",
                    background: pollClosed ? "var(--ink-100)" : "var(--brand-50)",
                    border: `1px solid ${pollClosed ? "var(--ink-200)" : "var(--brand-200)"}`,
                    padding: "2.5px 9px", borderRadius: 10,
                  }}
                >
                  <Clock size={11} /> {pollCountdown}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Recommendations */}
        {displayRecs && displayRecs.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 14 }}>
            {displayRecs.map((rec) => {
              const resolved = recNames?.[rec.listingId];
              return (
                <button
                  key={rec.listingId}
                  className="row gap-10 center-v"
                  style={{
                    padding: "10px 12px", borderRadius: 14, background: "var(--ink-50)",
                    border: "1px solid var(--ink-200)", textAlign: "left",
                    transition: "transform 0.15s ease, background 0.2s ease"
                  }}
                  onClick={() => nav(rec.listingType === "BUSINESS" ? `/business/${rec.listingId}` : `/provider/${rec.listingId}`)}
                >
                  <SafeImg src={resolved?.image} variant={rec.listingType === "PROVIDER" ? "avatar" : "photo"} className="thumb" style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0 }} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="semi small ellipsis" style={{ color: "var(--ink-900)", fontSize: 13.5 }}>{resolved?.name ?? "Loading…"}</div>
                    <div className="tiny muted ellipsis" style={{ fontSize: 12 }}>{resolved?.sub}</div>
                  </div>
                  <span className="tiny semi" style={{ color: "var(--brand-700)", background: "var(--brand-50)", border: "1px solid var(--brand-150)", padding: "3px 9px", borderRadius: 8, fontSize: 11.5 }}>↳ {rec.byName}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="divider" style={{ margin: "16px 0 12px" }} />

        {/* Action controls */}
        <div className="row gap-8 center-v">
          {isGuest ? (
            <span className="row gap-6 small semi" style={{ color: "var(--ink-500)", padding: "6px 10px", fontSize: 13 }}>
              <Heart size={16} color="var(--ink-400)" /> {showLikeCount ? likeCount : ""}
            </span>
          ) : (
            <button
              className="row gap-6 small semi"
              style={{
                color: liked ? "var(--red-500)" : "var(--ink-600)",
                background: liked ? "var(--red-50)" : "var(--ink-50)",
                padding: "6px 12px", borderRadius: 12,
                transition: "all 0.2s ease",
                fontSize: 13, border: "none", cursor: "pointer"
              }}
              onClick={handleLike}
              aria-label={liked ? "Unlike this post" : "Like this post"}
            >
              <Heart size={16} weight={liked ? "fill" : "regular"} className={liked ? "heart-animated" : ""} color={liked ? "var(--red-500)" : "var(--ink-600)"} />
              {/* The author can hide the tally; the button itself always works. */}
              {showLikeCount ? likeCount : liked ? "Liked" : "Like"}
            </button>
          )}
          <button
            className="row gap-6 small semi"
            style={{ color: "var(--ink-600)", background: "var(--ink-50)", padding: "6px 12px", borderRadius: 12, fontSize: 13, border: "none", cursor: "pointer" }}
            onClick={() => nav(`/community/${post.id}`, { state: { post } })}
            aria-label={`${post.commentsCount} comments — open post`}
          >
            <MessageCircle size={16} color="var(--ink-600)" /> {post.commentsCount}
          </button>

          {/* Save is private and has no counter, which is the point: it answers
              "I need this later", not "I appreciated this". */}
          {!isGuest && (
            <button
              className="row gap-6 small semi"
              style={{
                color: saved ? "var(--brand-700)" : "var(--ink-600)",
                background: saved ? "var(--brand-50)" : "var(--ink-50)",
                padding: "6px 12px", borderRadius: 12, fontSize: 13, border: "none", cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onClick={handleSave}
              aria-pressed={saved}
              aria-label={saved ? "Remove from saved" : "Save this post"}
            >
              <Bookmark size={16} weight={saved ? "fill" : "regular"} color={saved ? "var(--brand-700)" : "var(--ink-600)"} />
            </button>
          )}

          {!isGuest && (
            <button
              className="row gap-6 small semi"
              style={{ color: "var(--ink-600)", background: "var(--ink-50)", padding: "6px 12px", borderRadius: 12, fontSize: 13, border: "none", cursor: "pointer" }}
              onClick={() => setSharing(true)}
              aria-label={t("card_share_post")}
            >
              <Share2 size={16} color="var(--ink-600)" />
            </button>
          )}

          {!isGuest && post.type === "RECOMMENDATION" && (
            <button
              className="row gap-6 tiny semi"
              style={{
                marginLeft: "auto", color: "var(--brand-700)",
                background: "var(--brand-50)", border: "1px solid var(--brand-150)",
                padding: "6px 12px", borderRadius: 12, fontWeight: 700, fontSize: 12, cursor: "pointer"
              }}
              onClick={() => setRecommendOpen(true)}
            >
              + Recommend
            </button>
          )}
        </div>
      </div>

      {sharing && (
        <ShareCard
          subjects={{
            kind: "post",
            id: post.id,
            postType: post.type,
            title: post.title,
            subtitle: postShareSubtitle(post),
            image: cardMedia[0] ?? post.authorAvatar,
            meta: COMMUNITY_TYPE_META[post.type].label,
          }}
          onClose={() => setSharing(false)}
        />
      )}

      {deleteConfirm && (
        <div className="overlay" onClick={() => (deleting ? null : setDeleteConfirm(false))}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h2 className="h2" style={{ marginBottom: 6 }}>{t("card_delete_post_q")}</h2>
            <p className="small muted" style={{ marginBottom: "var(--space-md)", lineHeight: 1.5 }}>
              This removes it and its comments for everyone. This can't be undone.
            </p>
            <div className="col gap-8">
              <button
                className="btn btn-block"
                style={{ background: "var(--red-500)", color: "#fff" }}
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await communityService.delete(post.id);
                    showToast(t("card_post_deleted"));
                    setDeleteConfirm(false);
                    // The row has to leave the feed now — onHide drops it
                    // locally for feeds that track hidden ids, onRefetch for
                    // the rest. Whichever the parent passed.
                    onHide?.(post.id);
                    onRefetch?.();
                  } catch (e) {
                    showToast(errorMessage(e, "Couldn't delete — try again"));
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button className="btn btn-ghost btn-block" disabled={deleting} onClick={() => setDeleteConfirm(false)}>{t("card_keep_post")}</button>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="overlay" onClick={() => setMenuOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("card_post_options")}>
            <div className="sheet-grab" />
            <div className="col gap-8">
              <button
                className="action-row"
                onClick={() => { setMenuOpen(false); handleSave(); }}
              >
                <Bookmark size={18} weight={saved ? "fill" : "regular"} color="var(--brand-600)" />
                <span className="semi small grow" style={{ textAlign: "left" }}>{saved ? "Remove from saved" : "Save for later"}</span>
              </button>
              <button className="action-row" onClick={() => { setMenuOpen(false); setSharing(true); }}>
                <Share2 size={18} color="var(--ink-700)" />
                <span className="semi small grow" style={{ textAlign: "left" }}>{t("card_share")}</span>
              </button>
              {isPostAuthor && (
                <>
                  {/* The author's own lifecycle actions. Editing still happens
                      in the detail screen's EditPostSheet — it's a full form,
                      not a menu row — so this navigates there with it already
                      open rather than duplicating the sheet on the card. */}
                  <button
                    className="action-row"
                    onClick={() => { setMenuOpen(false); nav(`/community/${post.id}`, { state: { post, openEdit: true } }); }}
                  >
                    <Pencil size={18} color="var(--ink-700)" />
                    <span className="semi small grow" style={{ textAlign: "left" }}>{t("card_edit_post")}</span>
                  </button>
                  {canMarkResolved && (
                    <button
                      className="action-row"
                      disabled={resolvedBusy}
                      onClick={async () => {
                        setMenuOpen(false);
                        const next = !isResolved;
                        setResolvedOverride(next); // deliberate single tap — should feel instant
                        setResolvedBusy(true);
                        try {
                          await communityService.setResolved(post.id, next);
                          showToast(next ? "Marked resolved" : "Reopened");
                          onRefetch?.();
                        } catch (e) {
                          setResolvedOverride(!next); // revert so the badge never lies
                          showToast(errorMessage(e, "Couldn't update — try again"));
                        } finally {
                          setResolvedBusy(false);
                        }
                      }}
                    >
                      <CheckCircle2 size={18} color={isResolved ? "var(--ink-700)" : "var(--green-600)"} />
                      <span className="semi small grow" style={{ textAlign: "left" }}>{isResolved ? "Reopen post" : "Mark as resolved"}</span>
                    </button>
                  )}
                  <button className="action-row" onClick={() => { setMenuOpen(false); setDeleteConfirm(true); }}>
                    <Trash2 size={18} color="var(--red-500)" />
                    <span className="semi small grow" style={{ textAlign: "left", color: "var(--red-600)" }}>{t("card_delete_post")}</span>
                  </button>
                </>
              )}
              {!isPostAuthor && (
                <>
                  {/* Hide and mute are "show me less", held locally. Report and
                      block are moderation and go to the server. */}
                  <button
                    className="action-row"
                    onClick={() => {
                      setMenuOpen(false);
                      onHide?.(post.id);
                      showToast(t("card_post_hidden"));
                    }}
                  >
                    <EyeOff size={18} color="var(--ink-700)" />
                    <span className="semi small grow" style={{ textAlign: "left" }}>{t("card_hide_post")}</span>
                  </button>
                  {muteTargetId(post) && (
                    <button
                      className="action-row"
                      onClick={() => {
                        setMenuOpen(false);
                        onMute?.(muteTargetId(post)!, post.authorName);
                        showToast(`You'll see fewer posts from ${post.authorName}`);
                      }}
                    >
                      <Ban size={18} color="var(--ink-700)" />
                      <span className="semi small grow" style={{ textAlign: "left" }}>Mute {post.authorName}</span>
                    </button>
                  )}
                  <button className="action-row" onClick={() => { setMenuOpen(false); setReporting(true); }}>
                    <Flag size={18} color="var(--red-500)" />
                    <span className="semi small grow" style={{ textAlign: "left", color: "var(--red-600)" }}>{t("card_report_post")}</span>
                  </button>
                </>
              )}
            </div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setMenuOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {reporting && (
        <ReportSheet targetType="POST" targetId={post.id} name={post.title || "this post"} onClose={() => setReporting(false)} />
      )}

      {/* Recommendation picker sheet — the shared ListingPickerSheet, also used
          by the composer's "tag a business" control. */}
      {recommendOpen && (
        <ListingPickerSheet
          title="Recommend a place"
          onPick={(p) => handleRecommend(p.listingType, p.listingId)}
          onClose={() => setRecommendOpen(false)}
        />
      )}
    </>
  );
}
