import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MapPin, MessageCircle, Search as SearchIcon, FileText, ArrowLeft, ArrowUpDown } from "@/components/Icons";
import { requestService, communityService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard, CommunityCard } from "@/components/cards";
import { EmptyState } from "@/components/common";
import { useApp } from "@/store";
import { trendingScore } from "@/lib/trending";
import type { CommunityPost, CommunityPostType } from "@/types";

type HubTab = "requests" | "posts";

const POST_FILTERS: ("ALL" | CommunityPostType)[] = ["ALL", "ALERT", "LOST_FOUND", "RECOMMENDATION", "GIVEAWAY", "POLL", "SHOUTOUT"];
const POST_LABELS: Record<"ALL" | CommunityPostType, string> = {
  ALL: "All", ALERT: "📢 Alert", LOST_FOUND: "🔍 Lost & Found",
  RECOMMENDATION: "💬 Ask", GIVEAWAY: "🎁 Giveaway", POLL: "📊 Poll", SHOUTOUT: "🙌 Shoutout",
};

export default function CommunityHub() {
  const nav = useNavigate();
  const { area, user, chatUnread, activeContext, showToast } = useApp();
  const [tab, setTab] = useState<HubTab>("posts");
  const [postFilter, setPostFilter] = useState<"ALL" | CommunityPostType>("ALL");
  const [reqSpecial, setReqSpecial] = useState<"all" | "urgent" | "group" | "recurring">("all");
  const [postSort, setPostSort] = useState<"recent" | "trending">("recent");

  const { data: feedPage, loading: reqLoading, error: reqError, refetch: refetchReq } = useQueryWithRealtime(
    () => requestService.feed({ lat: user.lat || 0, lng: user.lng || 0 }),
    "requests",
    [user.lat, user.lng]
  );
  const { data: postData, loading: postsLoading, error: postsError, refetch: refetchPosts } = useQuery(
    () => communityService.feed({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );

  // Pagination: the first page comes from the query above; further pages are
  // appended here via the service's cursor (same pattern as Requests.tsx) —
  // without this, anything past the first 20 posts was permanently unreachable.
  const [extraPosts, setExtraPosts] = useState<CommunityPost[]>([]);
  const [postCursor, setPostCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  useEffect(() => {
    setExtraPosts([]);
    setPostCursor(postData?.page?.next_cursor ?? null);
    setPostsHasMore(postData?.page?.has_more ?? false);
  }, [postData]);

  async function loadMorePosts() {
    if (!postCursor || loadingMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const next = await communityService.feed({ lat: user.lat || undefined, lng: user.lng || undefined, cursor: postCursor });
      setExtraPosts((prev) => [...prev, ...(next.data ?? [])]);
      setPostCursor(next.page?.next_cursor ?? null);
      setPostsHasMore(next.page?.has_more ?? false);
    } catch {
      showToast("Couldn't load more posts");
    } finally {
      setLoadingMorePosts(false);
    }
  }

  const allRequests = feedPage?.data ?? [];
  let requests = allRequests;
  if (reqSpecial === "urgent")    requests = requests.filter((r) => r.isUrgent);
  if (reqSpecial === "group")     requests = requests.filter((r) => r.isGroupBuy);
  if (reqSpecial === "recurring") requests = requests.filter((r) => r.isRecurring);

  const allPosts = [...(postData?.data ?? []), ...extraPosts];
  const filteredPosts = postFilter === "ALL" ? allPosts : allPosts.filter((p) => p.type === postFilter);
  const posts = postSort === "trending" ? [...filteredPosts].sort((a, b) => trendingScore(b) - trendingScore(a)) : filteredPosts;

  // A seller viewing the public hub still composes under their active identity.
  const isOwnerContext = activeContext.type !== "customer" && !!activeContext.id;
  function goToCompose() {
    nav(
      "/community/new",
      isOwnerContext
        ? { state: activeContext.type === "business"
            ? { businessId: activeContext.id, businessName: activeContext.name }
            : { providerId: activeContext.id, providerName: activeContext.name } }
        : undefined
    );
  }

  return (
    <div className="screen with-nav">
      {/* Sticky header */}
      <header style={{ background: "#fff", position: "sticky", top: 0, zIndex: 20, borderBottom: "1px solid var(--line)" }}>
        <div style={{ padding: "calc(14px + var(--safe-area-top)) 16px 0" }}>
          {/* Title row */}
          <div className="row between" style={{ marginBottom: 12 }}>
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
              <div>
                <div className="bold" style={{ fontSize: 20 }}>Community</div>
                <div className="tiny muted row gap-4"><MapPin size={11} /> {area}</div>
              </div>
            </div>
            <div className="row gap-6">
              <button
                className="icon-btn"
                style={{ position: "relative" }}
                onClick={() => nav("/chats?scope=CUSTOMER")}
                aria-label="Messages"
              >
                <MessageCircle size={20} />
                {chatUnread > 0 && (
                  <span style={{
                    position: "absolute", top: 5, right: 5,
                    width: 8, height: 8, background: "var(--red-500)",
                    borderRadius: "50%", border: "2px solid #fff",
                  }} />
                )}
              </button>
              <button className="icon-btn" onClick={() => nav("/search")} aria-label="Search">
                <SearchIcon size={20} />
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={goToCompose}
              >
                <Plus size={14} /> Post
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ border: "1.5px solid var(--ink-200)", fontWeight: 700 }}
                onClick={() => nav("/ask")}
              >
                <FileText size={14} /> Request
              </button>
            </div>
          </div>

          {/* Main tabs */}
          <div className="row" style={{ gap: 0 }}>
            {([["requests", "📋 Requests"], ["posts", "🏘️ Posts"]] as [HubTab, string][]).map(([t, label]) => (
              <button
                key={t}
                className={`hub-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary filter strip */}
        {tab === "requests" ? (
          <div className="hscroll" style={{ paddingTop: 10, paddingBottom: 8 }}>
            {([["all", "All"], ["urgent", "🔥 Urgent"], ["group", "👥 Group buy"], ["recurring", "🔁 Recurring"]] as const).map(([s, label]) => (
              <button
                key={s}
                className={`chip ${reqSpecial === s ? "active" : ""}`}
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={() => setReqSpecial(s)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="hscroll" style={{ paddingTop: 10, paddingBottom: 8 }}>
            {POST_FILTERS.map((f) => (
              <button
                key={f}
                className={`chip ${postFilter === f ? "active" : ""}`}
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={() => setPostFilter(f)}
              >
                {POST_LABELS[f]}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <div className="screen-scroll">
        {tab === "requests" && (
          reqLoading ? <ListSkeleton count={3} /> :
          reqError   ? <ErrorView error={reqError} onRetry={refetchReq} /> :
          requests.length === 0 ? (
            <EmptyState
              emoji="📭"
              title="All quiet nearby"
              text="No open requests in your area yet. Be the first!"
              action={
                <button className="btn btn-primary btn-sm" onClick={() => nav("/ask")}>
                  <FileText size={15} /> Post a request
                </button>
              }
            />
          ) : (
            <div className="col gap-12 page-pad" style={{ paddingBottom: 24 }}>
              {requests.map((r) => <RequestCard key={r.id} r={r} />)}
            </div>
          )
        )}

        {tab === "posts" && (
          postsLoading ? <ListSkeleton count={3} /> :
          postsError   ? <ErrorView error={postsError} onRetry={refetchPosts} /> :
          posts.length === 0 ? (
            <EmptyState
              emoji="🏘️"
              title="Nothing posted yet"
              text="Be the first to share something with your street."
              action={
                <button className="btn btn-primary btn-sm" onClick={goToCompose}>
                  <Plus size={15} /> Post something
                </button>
              }
            />
          ) : (
            <div className="col gap-12 page-pad" style={{ paddingBottom: 24 }}>
              <button
                className="row gap-6 center-v tiny semi"
                style={{ alignSelf: "flex-end", color: "var(--brand-700)" }}
                onClick={() => setPostSort((s) => (s === "trending" ? "recent" : "trending"))}
              >
                <ArrowUpDown size={13} /> Sort: {postSort === "trending" ? "🔥 Trending nearby" : "Recent"}
              </button>
              {posts.map((p) => (
                <CommunityCard key={p.id} post={p} onRefetch={refetchPosts} />
              ))}
              {postFilter === "ALL" && postsHasMore && (
                <button className="btn btn-ghost btn-block" onClick={loadMorePosts} disabled={loadingMorePosts} style={{ marginTop: 4 }}>
                  {loadingMorePosts ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
