import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { ListSkeleton } from "@/components/states";
import { socialService, communityService } from "@/services";
import { PostSummaryRow } from "@/components/cards";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { StoryViewer } from "@/components/Stories";
import { hoursLeft } from "@/lib/stories";
import type { Story, CommunityPost } from "@/types";

type Tab = "stories" | "posts";

/**
 * "My Activity" — a per-identity archive of the stories and posts you've shared.
 * Role-aware: shows the customer's, the business's, or the provider's own content depending on the active context.
 * Stories: everything that is live right now, then what was saved to Highlights.
 */
export default function MyActivity() {
  const nav = useNavigate();
  const { t, tf } = useI18n();
  const { activeContext, user } = useApp();
  const [tab, setTab] = useState<Tab>("stories");
  const [viewing, setViewing] = useState<number | null>(null);

  const bizId = activeContext.type === "business" ? activeContext.id : null;
  const provId = activeContext.type === "provider" ? activeContext.id : null;

  const { data: storyData, loading: storiesLoading, refetch: refetchStories } = useQuery<Story[]>(() => {
    if (bizId) return socialService.activeFor("business", bizId);
    if (provId) return socialService.activeFor("provider", provId);
    // Customer: what is live now (newest first), then saved Highlights, without repeats.
    return Promise.all([socialService.myStories(), socialService.myHighlights()]).then(([active, highlights]) => {
      const live = new Set(active.map((s) => s.id));
      return [...active.slice().reverse(), ...highlights.filter((h) => !live.has(h.id))];
    });
  }, [bizId, provId, user.id]);

  const { data: postData, loading: postsLoading } = useQuery<CommunityPost[]>(() => {
    if (bizId) return communityService.byAuthorRef("business", bizId);
    if (provId) return communityService.byAuthorRef("provider", provId);
    return communityService.byAuthor(user.id);
  }, [bizId, provId, user.id]);

  const stories = storyData ?? [];
  const posts = postData ?? [];
  const emptyKey = bizId ? "myact_stories_empty_shop" : provId ? "myact_stories_empty_service" : "myact_stories_empty_you";
  const tabs: [Tab, string][] = [["stories", tf("myact_tab_stories", { n: stories.length })], ["posts", tf("myact_tab_posts", { n: posts.length })]];

  return (
    <div className="screen screen-boxed">
      <AppBar title={t("myact_title")} subtitle={t("myact_sub")} />

      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "var(--white)" }} role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="semi"
            style={{ flex: 1, padding: "12px 0", fontSize: 13.5, color: tab === key ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === key ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <div className="screen-scroll page-pad" style={{ paddingTop: 14, paddingBottom: 24 }}>
        {tab === "stories" && (
          storiesLoading ? <ListSkeleton count={2} /> : stories.length === 0 ? (
            <EmptyState
              emoji="📸"
              title={t("myact_stories_empty_title")}
              text={t(emptyKey)}
              action={<button className="btn btn-primary" onClick={() => nav("/story/new")}>{t("story_add_aria")}</button>}
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {stories.map((s, i) => {
                const left = hoursLeft(s);
                const live = !!s.expiresAt && Date.parse(s.expiresAt) > Date.now();
                return (
                  <button key={s.id} onClick={() => setViewing(i)} style={{ position: "relative", border: "none", padding: 0, background: "none", cursor: "pointer" }}>
                    <SafeImg src={s.image} variant="photo" style={{ width: "100%", aspectRatio: "3/4", borderRadius: 12, objectFit: "cover" }} />
                    <span className={`ma-pill ${live ? "live" : "saved"}`}>
                      {live ? (left < 1 ? t("myact_live_soon") : tf("myact_live_left", { n: left })) : `★ ${t("story_saved")}`}
                    </span>
                    {s.caption && <div className="tiny ellipsis" style={{ position: "absolute", bottom: 0, left: 0, right: 0, color: "var(--white)", padding: "4px 6px", background: "linear-gradient(transparent, rgba(0,0,0,0.6))", borderRadius: "0 0 12px 12px" }}>{s.caption}</div>}
                  </button>
                );
              })}
            </div>
          )
        )}

        {tab === "posts" && (
          postsLoading ? <ListSkeleton count={3} /> : posts.length === 0 ? (
            <EmptyState emoji="🏘️" title={t("myact_posts_empty_title")} text={t("myact_posts_empty_text")} />
          ) : (
            <div className="col gap-12">
              {posts.map((p) => (
                <PostSummaryRow key={p.id} post={p} onClick={() => nav(`/community/${p.id}`, { state: { post: p } })} />
              ))}
            </div>
          )
        )}
      </div>

      {viewing !== null && stories.length > 0 && (
        <StoryViewer stories={stories} startIndex={viewing} onClose={() => setViewing(null)} onChanged={() => refetchStories()} />
      )}
    </div>
  );
}
