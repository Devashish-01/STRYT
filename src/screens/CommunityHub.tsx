import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MapPin, MessageCircle, Search as SearchIcon, FileText, ArrowLeft, ArrowUpDown, RefreshCw, Check } from "@/components/Icons";
import { requestService, communityService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard, CommunityCard } from "@/components/cards";
import { EmptyState, SafeImg } from "@/components/common";
import { StoriesBar } from "@/components/Stories";
import { useApp } from "@/store";
import { POST_FILTERS, filterLabel } from "@/lib/communityTypes";
import {
  HIDDEN_POSTS_KEY,
  MUTED_AUTHORS_KEY,
  addToIdList,
  filterFeed,
  readIdList,
} from "@/lib/postInteractions";
import {
  DEFAULT_FEED_SORT,
  FEED_SORT_META,
  appendPage,
  availableSorts,
  countUnseen,
  typeParam,
  type FeedSort,
} from "@/lib/feedSort";
import { haptics } from "@/lib/haptics";
import type { CommunityPost, CommunityPostType } from "@/types";
import { useSmartBack } from "@/hooks/useSmartBack";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useRealtimeInserts } from "@/hooks/useRealtimeInserts";
import { useI18n } from "@/lib/i18n";

type HubTab = "requests" | "posts";

export default function CommunityHub() {
  const nav = useNavigate();
  const { area, user, chatUnread, activeContext, showToast } = useApp();
  const { t, tf } = useI18n();
  const goBack = useSmartBack("/home");
  const [tab, setTab] = useState<HubTab>("posts");
  const [postFilter, setPostFilter] = useState<"ALL" | CommunityPostType>("ALL");
  const [reqSpecial, setReqSpecial] = useState<"all" | "urgent" | "group" | "recurring">("all");
  const [postSort, setPostSort] = useState<FeedSort>(DEFAULT_FEED_SORT);
  const [sortOpen, setSortOpen] = useState(false);
  // Seeded from localStorage so a hidden post stays hidden across sessions —
  // these are a viewer preference, not a moderation record, so they never leave
  // the device (blocking, which does, lives in socialService).
  const [hiddenPosts, setHiddenPosts] = useState<string[]>(() => readIdList(HIDDEN_POSTS_KEY, localStorage));
  const [mutedAuthors, setMutedAuthors] = useState<string[]>(() => readIdList(MUTED_AUTHORS_KEY, localStorage));

  const hubGeoKey = `${(user.lat ?? 0).toFixed(2)}:${(user.lng ?? 0).toFixed(2)}`;
  const { data: feedPage, loading: reqLoading, error: reqError, refetch: refetchReq } = useQueryWithRealtime(
    () => requestService.feed({ lat: user.lat || 0, lng: user.lng || 0 }),
    "requests",
    [user.lat, user.lng],
    undefined,
    `hub:req:${hubGeoKey}`
  );
  // The type filter and the sort are QUERY parameters, not post-fetch
  // transformations. That's what makes a filtered view paginate (the old client
  // filter meant "load more" fetched 20 unfiltered posts and discarded most of
  // them, so CommunityHub only offered it on "ALL") and what makes "trending"
  // rank the whole feed instead of the page already in memory.
  const { data: postData, loading: postsLoading, error: postsError, refetch: refetchPosts } = useQuery(
    () => communityService.feed({
      lat: user.lat || undefined,
      lng: user.lng || undefined,
      type: typeParam(postFilter),
      sort: postSort,
    }),
    [user.lat, user.lng, postFilter, postSort],
    `hub:posts:${postFilter}:${postSort}:${hubGeoKey}`
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
      const next = await communityService.feed({
        lat: user.lat || undefined,
        lng: user.lng || undefined,
        cursor: postCursor,
        type: typeParam(postFilter),
        sort: postSort,
      });
      // appendPage drops anything already on screen: offset pagination re-serves
      // rows whenever a post is created between two page fetches, which would
      // otherwise render twice (and duplicate React keys).
      setExtraPosts((prev) => appendPage(prev, next.data ?? []));
      setPostCursor(next.page?.next_cursor ?? null);
      setPostsHasMore(next.page?.has_more ?? false);
    } catch {
      showToast("Couldn't load more posts");
    } finally {
      setLoadingMorePosts(false);
    }
  }

  // New posts are counted, never auto-inserted — see useRealtimeInserts.
  const { newIds, reset: resetNewIds } = useRealtimeInserts("community_posts", { enabled: tab === "posts" });

  async function refreshFeed() {
    resetNewIds();
    refetchPosts();
    refetchReq();
  }

  const { containerRef, pullDistance, refreshing } = usePullToRefresh<HTMLDivElement>(refreshFeed);

  const allRequests = feedPage?.data ?? [];
  let requests = allRequests;
  if (reqSpecial === "urgent")    requests = requests.filter((r) => r.isUrgent);
  if (reqSpecial === "group")     requests = requests.filter((r) => r.isGroupBuy);
  if (reqSpecial === "recurring") requests = requests.filter((r) => r.isRecurring);

  const allPosts = appendPage(postData?.data ?? [], extraPosts);
  // "Show me less of this" is applied client-side and immediately: the row
  // disappears on tap rather than after a refetch, which is the whole point of
  // hiding something.
  //
  // Type filtering and ordering are NOT re-applied here — the server already
  // did both, and re-sorting locally (sortPostsLocally, in lib/feedSort) would
  // fight it: "trending" scores age against Date.now() on every call, so
  // re-sorting an already-server-ordered page on every render could reshuffle
  // it under the reader for no reason.
  const posts = filterFeed(allPosts, hiddenPosts, mutedAuthors);
  const unseenCount = countUnseen(newIds, allPosts);

  function hidePost(postId: string) {
    setHiddenPosts(addToIdList(HIDDEN_POSTS_KEY, postId, localStorage));
  }

  function muteAuthor(authorId: string) {
    setMutedAuthors(addToIdList(MUTED_AUTHORS_KEY, authorId, localStorage));
  }

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

  function handleBack() {
    if (activeContext.type === "business" && activeContext.id) {
      nav(`/business/${activeContext.id}/manage`);
      return;
    }
    if (activeContext.type === "provider" && activeContext.id) {
      nav(`/provider/${activeContext.id}/manage`);
      return;
    }
    goBack();
  }

  return (
    <div className="screen with-nav community-hub-screen community-theme">
      <header className="community-hub-header">
        <div className="community-hub-top">
          <button
            className="icon-btn"
            onClick={handleBack}
            aria-label={t("go_back")}
            style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--ink-100)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 22, letterSpacing: "-0.5px", lineHeight: 1.2, color: "var(--ink-900)" }}>
              {t("community_header")}
            </div>
            <div
              className="tiny semi row gap-4 ellipsis"
              style={{
                color: "var(--brand-700)",
                background: "var(--brand-50)",
                padding: "2.5px 9px",
                borderRadius: 12,
                width: "fit-content",
                border: "1px solid var(--brand-150)",
                fontSize: 11.5,
                letterSpacing: "-0.1px"
              }}
            >
              <MapPin size={11} /> {area}
            </div>
          </div>
          <div className="row gap-8" style={{ flexShrink: 0 }}>
            <button
              className="icon-btn"
              style={{ width: 38, height: 38, position: "relative", borderRadius: "50%", background: "var(--ink-100)", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => nav("/chats?scope=CUSTOMER")}
              aria-label={t("messages_header")}
            >
              <MessageCircle size={18} />
              {chatUnread > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: 4,
                  width: 8, height: 8, background: "var(--pink-500)",
                  borderRadius: "50%", border: "2px solid var(--surface)",
                  boxShadow: "0 0 8px var(--pink-500)"
                }} />
              )}
            </button>
            <button
              className="icon-btn"
              style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--ink-100)", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => nav("/search")}
              aria-label={t("search_word")}
            >
              <SearchIcon size={18} />
            </button>
          </div>
        </div>

        {/* Prompt bar — an invitation to write, rather than two buttons naming
            features. Composes under the active identity, same as the old
            "Create Post" button did. */}
        <button className="feed-prompt" style={{ marginTop: 14 }} onClick={goToCompose}>
          <SafeImg
            src={activeContext.type === "customer" ? user.avatar : undefined}
            variant="avatar"
            className="avatar"
            style={{ width: 32, height: 32, flexShrink: 0 }}
          />
          <span className="feed-prompt-text ellipsis">
            {tf("share_with_street", { area: area || t("your_street_fallback") })}
          </span>
          <span className="feed-prompt-cta"><Plus size={13} /> {t("post_word")}</span>
        </button>

        <div className="community-hub-actions" style={{ marginTop: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ height: 38, gap: 6, borderRadius: 14, border: "1.5px solid var(--ink-200)", background: "var(--surface)", fontWeight: 700, color: "var(--ink-800)", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)" }}
            onClick={() => nav("/ask")}
          >
            <FileText size={15} /> {t("post_a_request")}
          </button>
        </div>

        {/* Stories bar — neighborhood & business stories reel */}
        <div style={{ margin: "14px -16px 8px", paddingBottom: 2 }}>
          <StoriesBar />
        </div>

        {/* Apple iOS-style Segmented Control */}
        <div className="segmented-control">
          {([["posts", t("segment_posts")], ["requests", t("segment_requests")]] as [HubTab, string][]).map(([tabKey, label]) => (
            <button
              key={tabKey}
              className={`segmented-tab ${tab === tabKey ? "active" : ""}`}
              onClick={() => setTab(tabKey)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Secondary Samsung / Apple Pill Filter Strip */}
        {tab === "requests" ? (
          <div className="hscroll community-hub-filters">
            {([["all", t("filter_all")], ["urgent", t("filter_urgent")], ["group", t("filter_group_buy")], ["recurring", t("filter_recurring")]] as [typeof reqSpecial, string][]).map(([s, label]) => (
              <button
                key={s}
                className={`chip-pill ${reqSpecial === s ? "active" : ""}`}
                onClick={() => setReqSpecial(s)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="hscroll community-hub-filters">
            {POST_FILTERS.map((f) => (
              <button
                key={f}
                className={`chip-pill ${postFilter === f ? "active" : ""}`}
                onClick={() => setPostFilter(f)}
              >
                {filterLabel(f)}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <div className="screen-scroll" ref={containerRef} style={{ position: "relative" }}>
        {/* Pull-to-refresh indicator — only ever visible mid-gesture. */}
        {(pullDistance > 0 || refreshing) && (
          <div
            className="feed-refresh"
            style={{ height: Math.max(pullDistance, refreshing ? 44 : 0) }}
            role="status"
            aria-live="polite"
          >
            <span className={`feed-refresh-spinner ${refreshing ? "spinning" : ""}`}>
              <RefreshCw size={16} />
            </span>
            <span className="tiny semi">{refreshing ? t("refreshing_ellipsis") : pullDistance > 60 ? t("release_to_refresh") : t("pull_to_refresh")}</span>
          </div>
        )}

        {/* "N new posts" — the arrival is announced, never injected. Yanking the
            list while someone is reading is the most disorienting thing a feed
            can do, so the reader decides when to jump. */}
        {tab === "posts" && unseenCount > 0 && (
          <button
            className="feed-new-pill"
            onClick={() => {
              haptics.light();
              resetNewIds();
              refetchPosts();
              containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            {unseenCount === 1 ? t("new_post_one") : tf("new_post_other", { n: unseenCount })}
          </button>
        )}

        {tab === "requests" && (
          reqLoading ? <ListSkeleton count={3} /> :
          reqError   ? <ErrorView error={reqError} onRetry={refetchReq} /> :
          requests.length === 0 ? (
            <EmptyState
              emoji="📭"
              title={t("all_quiet_nearby")}
              text={t("all_quiet_desc")}
              action={
                <button className="btn btn-primary btn-sm" onClick={() => nav("/ask")}>
                  <FileText size={15} /> {t("post_a_request")}
                </button>
              }
            />
          ) : (
            <div className="col gap-16 page-pad" style={{ paddingBottom: 32 }}>
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
              title={t("nothing_posted_yet")}
              text={t("nothing_posted_desc")}
              action={
                <button className="btn btn-primary btn-sm" onClick={goToCompose}>
                  <Plus size={15} /> {t("post_something")}
                </button>
              }
            />
          ) : (
            <div className="col gap-16 page-pad" style={{ paddingBottom: 32 }}>
              {/* A real sort control, not a two-state toggle. It reads its own
                  state instead of making you tap to discover the other option. */}
              <button
                className="row gap-6 center-v tiny semi"
                style={{
                  alignSelf: "flex-end", color: "var(--brand-700)",
                  background: "var(--surface)", border: "1px solid var(--ink-200)",
                  padding: "5px 12px", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                  fontSize: 12.5, cursor: "pointer", transition: "all 0.15s ease"
                }}
                onClick={() => setSortOpen(true)}
                aria-haspopup="dialog"
              >
                <ArrowUpDown size={13} /> {FEED_SORT_META[postSort].emoji} {FEED_SORT_META[postSort].label}
              </button>
              {posts.map((p) => (
                <CommunityCard
                  key={p.id}
                  post={p}
                  onRefetch={refetchPosts}
                  onHide={hidePost}
                  onMute={muteAuthor}
                />
              ))}
              {/* No longer gated on postFilter === "ALL": the filter is part of
                  the query now, so the next page is the next page OF THIS FILTER. */}
              {postsHasMore && (
                <button className="btn btn-ghost btn-block" onClick={loadMorePosts} disabled={loadingMorePosts} style={{ marginTop: 8 }}>
                  {loadingMorePosts ? t("loading_ellipsis") : t("load_more")}
                </button>
              )}
            </div>
          )
        )}
      </div>

      {sortOpen && (
        <div className="overlay" onClick={() => setSortOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("sort_posts")}>
            <div className="sheet-grab" />
            <div className="bold" style={{ fontSize: 17, marginBottom: 12 }}>{t("sort_posts")}</div>
            <div className="col gap-8" role="radiogroup" aria-label={t("sort_posts")}>
              {/* "Nearest" is hidden without a location rather than offered and
                  silently ignored. */}
              {availableSorts(!!(user.lat && user.lng)).map((s) => {
                const on = postSort === s.value;
                return (
                  <button
                    key={s.value}
                    role="radio"
                    aria-checked={on}
                    className="row gap-10 center-v"
                    style={{
                      width: "100%", padding: "11px 13px", textAlign: "left", cursor: "pointer", borderRadius: 14,
                      border: on ? "1.5px solid var(--brand-600)" : "1.5px solid var(--ink-200)",
                      background: on ? "var(--brand-50)" : "var(--surface)",
                    }}
                    onClick={() => {
                      haptics.selection();
                      setPostSort(s.value);
                      setSortOpen(false);
                    }}
                  >
                    <span style={{ fontSize: 18 }} aria-hidden="true">{s.emoji}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="semi small" style={{ display: "block", color: on ? "var(--brand-900)" : "var(--ink-900)" }}>{s.label}</span>
                      <span className="tiny muted">{s.hint}</span>
                    </span>
                    {on && <Check size={16} color="var(--brand-600)" />}
                  </button>
                );
              })}
            </div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setSortOpen(false)}>{t("cancel_action")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
