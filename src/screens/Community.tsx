import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, Plus, MapPin, Search as SearchIcon, CheckCircle2, ArrowLeft, ArrowUpDown } from "@/components/Icons";
import { communityService, discoveryService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { useApp } from "@/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { trendingScore } from "@/lib/trending";
import type { CommunityPost, CommunityPostType, Business, Provider, BookmarkTarget } from "@/types";
import { displayName as safeName } from "@/lib/publicName";
import { openProfile } from "@/lib/profileSheet";

const typeMeta: Record<CommunityPostType, { label: string; emoji: string; tone: string }> = {
  LOST_FOUND: { label: "Lost & Found", emoji: "🔍", tone: "amber" },
  ALERT: { label: "Alert", emoji: "📢", tone: "red" },
  RECOMMENDATION: { label: "Ask neighbors", emoji: "💬", tone: "purple" },
  GIVEAWAY: { label: "Giveaway", emoji: "🎁", tone: "green" },
  POLL: { label: "Poll", emoji: "📊", tone: "blue" },
  SHOUTOUT: { label: "Shoutout", emoji: "🙌", tone: "purple" },
};

const filters: ("ALL" | CommunityPostType)[] = ["ALL", "ALERT", "LOST_FOUND", "RECOMMENDATION", "GIVEAWAY", "POLL", "SHOUTOUT"];

export default function Community() {
  const nav = useNavigate();
  const { area, user, activeContext, isGuest } = useApp();
  const [filter, setFilter] = useState<"ALL" | CommunityPostType>("ALL");
  const [sort, setSort] = useState<"recent" | "trending">("recent");
  const { data, loading, error, refetch } = useQueryWithRealtime(
    () => communityService.feed({ lat: user.lat || undefined, lng: user.lng || undefined }),
    "community_posts",
    [user.lat, user.lng]
  );
  const { data: bizPage } = useQuery(() => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: provPage } = useQuery(() => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);

  const posts = data ?? [];
  const businesses = bizPage?.data ?? [];
  const providers = provPage?.data ?? [];
  const filtered = posts.filter((p) => filter === "ALL" || p.type === filter);
  const list = sort === "trending" ? [...filtered].sort((a, b) => trendingScore(b) - trendingScore(a)) : filtered;

  return (
    <div className="screen with-nav">
      <header className="appbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, paddingBottom: 0 }}>
        <div className="row between">
          <div className="row gap-8" style={{ alignItems: "center" }}>
            {activeContext.type !== "customer" && (
              <button
                className="icon-btn-sm"
                style={{ marginRight: 4, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => nav(activeContext.type === "business" ? `/business/${activeContext.id}/manage` : `/provider/${activeContext.id}/manage`)}
                aria-label="Back to Dashboard"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="col" style={{ gap: 0 }}>
              <span className="bold" style={{ fontSize: 20 }}>Community</span>
              <span className="tiny muted row gap-4"><MapPin size={11} /> {area}</span>
            </div>
          </div>
          <div className="row gap-8">
            <button className="icon-btn" onClick={() => nav("/search")}><SearchIcon size={18} /></button>
            {!isGuest && <button className="btn btn-primary btn-sm" onClick={() => nav("/community/new")}><Plus size={16} /> Post</button>}
          </div>
        </div>
        <div className="hscroll" style={{ padding: "0 0 0 0", marginLeft: -4 }}>
          {filters.map((f) => (
            <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "ALL" ? "All" : `${typeMeta[f].emoji} ${typeMeta[f].label}`}
            </button>
          ))}
        </div>
      </header>

      <div className="screen-scroll page-pad col gap-12" style={{ paddingTop: 14 }}>
        {loading ? (
          <ListSkeleton count={3} />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : list.length === 0 ? (
          <EmptyState
            emoji="🏘️"
            title="Nothing here yet"
            text={isGuest ? "No posts in this category near you." : "Be the first to post in this category."}
            action={isGuest ? undefined : <button className="btn btn-primary btn-sm" onClick={() => nav("/community/new")}>Post something</button>}
          />
        ) : (
          <>
            <button
              className="row gap-6 center-v tiny semi"
              style={{ alignSelf: "flex-end", color: "var(--brand-700)" }}
              onClick={() => setSort((s) => (s === "trending" ? "recent" : "trending"))}
            >
              <ArrowUpDown size={13} /> Sort: {sort === "trending" ? "🔥 Trending nearby" : "Recent"}
            </button>
            {list.map((p) => <CommunityCard key={p.id} post={p} businesses={businesses} providers={providers} onRefetch={refetch} />)}
          </>
        )}
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}

export function CommunityCard({ post, businesses = [], providers = [], onRefetch }: {
  post: CommunityPost;
  businesses?: Business[];
  providers?: Provider[];
  onRefetch?: () => void;
}) {
  const nav = useNavigate();
  const { votes, votePoll, user, showToast, isGuest } = useApp();
  const [recommendOpen, setRecommendOpen] = useState(false);
  const M = typeMeta[post.type];
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

  // Guests never reach these — the controls that call them are hidden below —
  // but they stay guarded at the render site rather than here so the handlers
  // remain plain, single-purpose functions for signed-in users.
  function handleLike() {
    const next = !liked;
    setLikeOverride(next); // optimistic
    communityService.like(post.id, liked).catch(() => {
      setLikeOverride(liked); // revert so the UI never lies
      showToast("Couldn't update like — try again");
    });
  }

  function handleVote(optId: string) {
    if (votedOption) return;
    votePoll(post.id, optId); // optimistic
    communityService.vote(post.id, optId).catch(() => {
      showToast("Couldn't record your vote — try again");
    });
  }

  async function handleRecommend(listingType: BookmarkTarget, listingId: string) {
    setRecommendOpen(false);
    await communityService.recommendListing(post.id, listingType as "BUSINESS" | "PROVIDER", listingId, safeName(user.name, "A neighbor"));
    onRefetch?.();
  }

  return (
    <>
      <div className="card">
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
                  <span
                    className="badge"
                    style={{
                      fontSize: 9, padding: "2px 6px",
                      background: post.authorType === "business" ? "var(--orange-100)" : "var(--green-100)",
                      color: post.authorType === "business" ? "var(--orange-500)" : "var(--green-600)",
                    }}
                  >
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
        {post.recommendations && post.recommendations.length > 0 && (
          <div className="col gap-8" style={{ marginTop: 12 }}>
            {post.recommendations.map((rec, i) => {
              const b = rec.listingType === "BUSINESS" ? businesses.find((x) => x.id === rec.listingId) : undefined;
              const p = rec.listingType === "PROVIDER" ? providers.find((x) => x.id === rec.listingId) : undefined;
              const name = b?.name ?? p?.displayName ?? rec.listingId;
              const image = b?.coverImage ?? p?.avatar ?? "";
              const sub = b?.subCategory ?? p?.categoryName ?? "";
              return (
                <button key={rec.listingId} className="row gap-10" style={{ padding: 8, borderRadius: 12, background: "var(--ink-50)", textAlign: "left" }}
                  onClick={() => nav(rec.listingType === "BUSINESS" ? `/business/${rec.listingId}` : `/provider/${rec.listingId}`)}>
                  <SafeImg src={image} variant={rec.listingType === "PROVIDER" ? "avatar" : "photo"} className="thumb" style={{ width: 44, height: 44, borderRadius: 10 }} />
                  <div className="grow">
                    <div className="semi small">{name}</div>
                    <div className="tiny muted">{sub}</div>
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
          businesses={businesses}
          providers={providers}
          onPick={handleRecommend}
          onClose={() => setRecommendOpen(false)}
        />
      )}
    </>
  );
}

function RecommendSheet({ businesses, providers, onPick, onClose }: {
  businesses: Business[];
  providers: Provider[];
  onPick: (type: BookmarkTarget, id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const lq = q.toLowerCase();
  const filteredBiz = businesses.filter((b) => b.name.toLowerCase().includes(lq));
  const filteredProv = providers.filter((p) => p.displayName.toLowerCase().includes(lq));

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
