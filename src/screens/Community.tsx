import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, Plus, MapPin, Search as SearchIcon, CheckCircle2 } from "lucide-react";
import { communityService, discoveryService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { useApp } from "@/store";
import type { CommunityPost, CommunityPostType, Business, Provider, BookmarkTarget } from "@/types";

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
  const { area, user } = useApp();
  const [filter, setFilter] = useState<"ALL" | CommunityPostType>("ALL");
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
  const list = posts.filter((p) => filter === "ALL" || p.type === filter);

  return (
    <div className="screen with-nav">
      <header className="appbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 12, paddingBottom: 0 }}>
        <div className="row between">
          <div className="col" style={{ gap: 0 }}>
            <span className="bold" style={{ fontSize: 20 }}>Community</span>
            <span className="tiny muted row gap-4"><MapPin size={11} /> {area}</span>
          </div>
          <div className="row gap-8">
            <button className="icon-btn" onClick={() => nav("/search")}><SearchIcon size={18} /></button>
            <button className="btn btn-primary btn-sm" onClick={() => nav("/community/new")}><Plus size={16} /> Post</button>
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
          <EmptyState emoji="🏘️" title="Nothing here yet" text="Be the first to post in this category." action={<button className="btn btn-primary btn-sm" onClick={() => nav("/community/new")}>Post something</button>} />
        ) : (
          list.map((p) => <CommunityCard key={p.id} post={p} businesses={businesses} providers={providers} onRefetch={refetch} />)
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
  const { likes, toggleLike, votes, votePoll, user } = useApp();
  const [recommendOpen, setRecommendOpen] = useState(false);
  const M = typeMeta[post.type];
  // XOR: the store tracks session-toggles only (empty on load); DB truth is post.liked.
  const toggled = likes.includes(post.id);
  const liked = toggled ? !post.liked : post.liked;
  const likeCount = Math.max(0, post.likes + (liked && !post.liked ? 1 : 0) - (!liked && post.liked ? 1 : 0));
  const votedOption = votes[post.id] ?? post.votedOptionId;
  const totalVotes = (post.pollOptions?.reduce((s, o) => s + o.votes, 0) ?? 0) + (votedOption && !post.votedOptionId ? 1 : 0);

  function handleLike() {
    toggleLike(post.id);
    communityService.like(post.id, liked).catch(() => {});
  }

  function handleVote(optId: string) {
    if (votedOption) return;
    votePoll(post.id, optId);
    communityService.vote(post.id, optId).catch(() => {});
  }

  async function handleRecommend(listingType: BookmarkTarget, listingId: string) {
    setRecommendOpen(false);
    await communityService.recommendListing(post.id, listingType as "BUSINESS" | "PROVIDER", listingId, user.name);
    onRefetch?.();
  }

  return (
    <>
      <div className="card" style={{ padding: 14 }}>
        <button className="row gap-10" style={{ width: "100%", textAlign: "left" }} onClick={() => nav(`/community/${post.id}`, { state: { post } })}>
          <SafeImg src={post.authorAvatar} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
          <div className="grow">
            <div className="row between">
              <span className="semi small">{post.authorName}</span>
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
                  onClick={() => handleVote(o.id)}
                  style={{ position: "relative", textAlign: "left", padding: "11px 13px", borderRadius: 10, border: voted ? "1.5px solid var(--brand-500)" : "1.5px solid var(--ink-200)", overflow: "hidden", background: "#fff" }}
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
                <button key={i} className="row gap-10" style={{ padding: 8, borderRadius: 12, background: "var(--ink-50)", textAlign: "left" }}
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
        <div className="row gap-16">
          <button className="row gap-6 small semi" style={{ color: liked ? "#ef4444" : "var(--ink-500)" }} onClick={handleLike}>
            <Heart size={17} fill={liked ? "#ef4444" : "none"} /> {likeCount}
          </button>
          <button className="row gap-6 small semi muted" onClick={() => nav(`/community/${post.id}`, { state: { post } })}>
            <MessageCircle size={17} /> {post.commentsCount} {post.commentsCount === 1 ? "comment" : "comments"}
          </button>
          {post.type === "RECOMMENDATION" && (
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
              <div className="grow"><div className="semi small">{p.displayName}</div><div className="tiny muted">{p.categoryName}</div></div>
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
