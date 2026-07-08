import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { Heart, MessageCircle } from "@/components/Icons";
import { socialService, communityService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { StoryViewer } from "@/components/Stories";
import type { Story, CommunityPost } from "@/types";

type Tab = "stories" | "posts";

/**
 * "My Activity" — a per-identity archive of the stories and posts you've shared,
 * with engagement tracking. Role-aware: shows the customer's, the business's, or
 * the provider's own content depending on the active context.
 */
export default function MyActivity() {
  const nav = useNavigate();
  const { activeContext, user } = useApp();
  const [tab, setTab] = useState<Tab>("stories");
  const [viewing, setViewing] = useState<number | null>(null);

  const bizId = activeContext.type === "business" ? activeContext.id : null;
  const provId = activeContext.type === "provider" ? activeContext.id : null;

  const { data: storyData, loading: storiesLoading } = useQuery<Story[]>(() => {
    if (bizId) return socialService.highlightsFor("business", bizId);
    if (provId) return socialService.highlightsFor("provider", provId);
    // Customer: active story + saved highlights, de-duped.
    return Promise.all([socialService.myStory(), socialService.myHighlights()]).then(([active, highlights]) => {
      const all = active ? [active, ...highlights.filter((h) => h.id !== active.id)] : highlights;
      return all;
    });
  }, [bizId, provId, user.id]);

  const { data: postData, loading: postsLoading } = useQuery<CommunityPost[]>(() => {
    if (bizId) return communityService.byAuthorRef("business", bizId);
    if (provId) return communityService.byAuthorRef("provider", provId);
    return communityService.byAuthor(user.id);
  }, [bizId, provId, user.id]);

  const stories = storyData ?? [];
  const posts = postData ?? [];

  const roleLabel = bizId ? "shop" : provId ? "service" : "you";

  return (
    <div className="screen screen-boxed">
      <AppBar title="My activity" subtitle="Stories & posts you've shared" />

      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
        {([["stories", `Stories (${stories.length})`], ["posts", `Posts (${posts.length})`]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="semi"
            style={{ flex: 1, padding: "12px 0", fontSize: 13.5, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <div className="screen-scroll page-pad" style={{ paddingTop: 14, paddingBottom: 24 }}>
        {tab === "stories" && (
          storiesLoading ? <ListSkeleton count={2} /> : stories.length === 0 ? (
            <EmptyState emoji="📸" title="No saved stories" text={`Stories ${roleLabel} highlight will be kept here past their 24-hour expiry.`} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {stories.map((s, i) => (
                <button key={s.id} onClick={() => setViewing(i)} style={{ position: "relative", border: "none", padding: 0, background: "none", cursor: "pointer" }}>
                  <SafeImg src={s.image} variant="photo" style={{ width: "100%", aspectRatio: "3/4", borderRadius: 12, objectFit: "cover" }} />
                  {s.isHighlighted && <span className="tiny" style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.55)", color: "#fff", borderRadius: 6, padding: "1px 6px" }}>★</span>}
                  {s.caption && <div className="tiny ellipsis" style={{ position: "absolute", bottom: 0, left: 0, right: 0, color: "#fff", padding: "4px 6px", background: "linear-gradient(transparent, rgba(0,0,0,0.6))", borderRadius: "0 0 12px 12px" }}>{s.caption}</div>}
                </button>
              ))}
            </div>
          )
        )}

        {tab === "posts" && (
          postsLoading ? <ListSkeleton count={3} /> : posts.length === 0 ? (
            <EmptyState emoji="🏘️" title="No posts yet" text="Community posts you share appear here with their likes and comments." />
          ) : (
            <div className="col gap-12">
              {posts.map((p) => (
                <button key={p.id} className="card col gap-6" style={{ padding: 14, textAlign: "left" }} onClick={() => nav(`/community/${p.id}`, { state: { post: p } })}>
                  <div className="row between">
                    <span className="semi small">{p.title || p.type}</span>
                    <span className="tiny muted">{p.postedAt}</span>
                  </div>
                  {p.body && <p className="small muted clamp-2" style={{ lineHeight: 1.5 }}>{p.body}</p>}
                  {p.image && <SafeImg src={p.image} style={{ width: "100%", height: 150, borderRadius: 12, objectFit: "cover" }} />}
                  <div className="row gap-14 tiny muted" style={{ marginTop: 2 }}>
                    <span className="row gap-4"><Heart size={13} /> {p.likes}</span>
                    <span className="row gap-4"><MessageCircle size={13} /> {p.commentsCount}</span>
                  </div>
                </button>
              ))}
            </div>
          )
        )}
      </div>

      {viewing !== null && stories.length > 0 && (
        <StoryViewer stories={stories} startIndex={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
