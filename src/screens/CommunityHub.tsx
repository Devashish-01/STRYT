import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MapPin, ArrowLeft, SlidersHorizontal, RefreshCw, Check, Ticket, CheckCircle2, Search, X } from "@/components/Icons";
import { requestService, communityService, bulkService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView, PostCardSkeleton } from "@/components/states";
import { CommunityCard } from "@/components/cards";
import BulkDealCard from "@/components/BulkDealCard";
import BulkOrderSheet from "@/components/BulkOrderSheet";
import { EmptyState, Section, inr } from "@/components/common";
import { StoriesBar } from "@/components/Stories";
import { useApp } from "@/store";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { CommunityPostType } from "@/types";
import {
  HIDDEN_POSTS_KEY,
  MUTED_AUTHORS_KEY,
  addToIdList,
  filterFeed,
  readIdList,
} from "@/lib/postInteractions";
import {
  DEFAULT_FEED_SORT,
  appendPage,
  availableSorts,
  countUnseen,
  typeParam,
  type FeedSort,
} from "@/lib/feedSort";
import { bucketCampaigns, needsDeposit } from "@/lib/bulkFeed";
import RadiusSelector from "@/components/RadiusSelector";
import { haptics } from "@/lib/haptics";
import type { BulkDeal, CommunityPost, RequestPost } from "@/types";
import { useSmartBack } from "@/hooks/useSmartBack";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useRealtimeInserts } from "@/hooks/useRealtimeInserts";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabaseClient";
import { useI18n } from "@/lib/i18n";

const DEALS_RADIUS_KM = 10;
const WIDEN_RADIUS_KM = 5;

// The two chips ("Alerts", "Lost & Found") that stay on the main row are the
// most commonly filtered/time-sensitive types; the other four move into the
// "More" sheet's Show section. Keys map into i18n — see the "Phase 2 header
// diet" block in lib/i18n.tsx.
const LONG_TAIL_TYPES: CommunityPostType[] = ["RECOMMENDATION", "GIVEAWAY", "POLL", "SHOUTOUT"];
const TYPE_LABEL_KEY: Record<CommunityPostType, string> = {
  RECOMMENDATION: "type_recommendation",
  LOST_FOUND: "type_lost_found",
  ALERT: "type_alert",
  GIVEAWAY: "type_giveaway",
  POLL: "type_poll",
  SHOUTOUT: "type_shoutout",
};
const SORT_LABEL_KEY: Record<FeedSort, string> = { recent: "sort_label_recent", trending: "sort_label_trending", nearest: "sort_label_nearest" };
const SORT_HINT_KEY: Record<FeedSort, string> = { recent: "sort_hint_recent", trending: "sort_hint_trending", nearest: "sort_hint_nearest" };

type StreamFilter = "ALL" | CommunityPostType | "BULK";

/** Compact radius for the header chip — matches RadiusSelector's own wording
 *  so the button and the sheet never disagree about the same number. */
function radiusLabel(km: number): string {
  if (km >= 5000) return "🌍";
  return km === 0.5 ? "500m" : `${km} km`;
}

export default function CommunityHub() {
  const nav = useNavigate();
  const { area, user, isGuest, activeContext, showToast } = useApp();
  const { t, tf } = useI18n();
  const requireAuth = useRequireAuth();
  const goBack = useSmartBack("/home");
  // ?view=deals lands straight on the unified Bulk buying view (group buys +
  // shop deals together) — the deep link Home's "Bulk & group buys" banner
  // and the desktop sidebar's nav item use now that they no longer point at
  // a dedicated /bulk screen. Same lazy-initializer pattern AskCompose uses
  // for its ?groupBuy=1 pre-arm.
  const [postFilter, setPostFilter] = useState<StreamFilter>(
    () => (new URLSearchParams(window.location.search).get("view") === "deals" ? "BULK" : "ALL")
  );
  const [postSort, setPostSort] = useState<FeedSort>(DEFAULT_FEED_SORT);
  const [moreOpen, setMoreOpen] = useState(false);
  // Keyword search (20260931). searchInput is what's being typed; searchQuery
  // is what's been asked for. They're separate so every keystroke doesn't
  // become a request — the debounce below is what joins them.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // ONE radius for this whole screen. Previously the bulk view kept its own
  // dealsRadiusKm (default 10km) that never touched `settings_radius` — the
  // key communityService/requestService actually read — so posts and campaigns
  // were silently searched at two different distances, and the posts feed
  // exposed no radius control at all beyond the empty state's "widen" button.
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("settings_radius") : null;
    const parsed = saved ? parseFloat(saved) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEALS_RADIUS_KM;
  });
  const [ordering, setOrdering] = useState<BulkDeal | null>(null);
  // Seeded from localStorage so a hidden post stays hidden across sessions —
  // these are a viewer preference, not a moderation record, so they never leave
  // the device (blocking, which does, lives in socialService).
  const [hiddenPosts, setHiddenPosts] = useState<string[]>(() => readIdList(HIDDEN_POSTS_KEY, localStorage));
  const [mutedAuthors, setMutedAuthors] = useState<string[]>(() => readIdList(MUTED_AUTHORS_KEY, localStorage));

  const hubGeoKey = `${(user.lat ?? 0).toFixed(2)}:${(user.lng ?? 0).toFixed(2)}`;
  // One unified "Bulk buying" view now, not two separate chips — group buys
  // (neighbours pooling) and shop deals (tiered bulk pricing) are different
  // mechanisms but both answer "where do I see bulk buying", so they render
  // together here, each in its own labelled section.
  const isBulkView = postFilter === "BULK";
  const isSpecialView = isBulkView;
  const isLongTailFilter = LONG_TAIL_TYPES.includes(postFilter as CommunityPostType);

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // The type filter and the sort are QUERY parameters, not post-fetch
  // transformations. That's what makes a filtered view paginate (the old client
  // filter meant "load more" fetched 20 unfiltered posts and discarded most of
  // them, so CommunityHub only offered it on "ALL") and what makes "trending"
  // rank the whole feed instead of the page already in memory.
  //
  // BULK doesn't fetch posts at all — that view renders its own
  // fully-fetched lists (deals, groupBuys) instead of the post stream.
  const { data: postData, loading: postsLoading, error: postsError, refetch: refetchPosts } = useQuery(
    () => isSpecialView
      ? Promise.resolve({ data: [], page: { next_cursor: null, has_more: false } })
      : communityService.feed({
          lat: user.lat || undefined,
          lng: user.lng || undefined,
          type: typeParam(postFilter as "ALL" | CommunityPostType),
          sort: postSort,
          query: searchQuery || undefined,
        }),
    [user.lat, user.lng, postFilter, postSort, searchQuery],
    // The query is part of the cache key — without it, typing a second search
    // would be served the first one's cached page.
    isSpecialView ? undefined : `hub:posts:${postFilter}:${postSort}:${searchQuery}:${hubGeoKey}`
  );

  // Business bulk deals — the rail (top 3, "ALL" filter only) and the full
  // "Bulk buying" view's deals section share this one fetch.
  const { data: dealsData, loading: dealsLoading, refetch: refetchDeals } = useQuery(
    () =>
      bulkService
        .deals({ lat: user.lat || undefined, lng: user.lng || undefined, radius: isBulkView ? radiusKm : undefined })
        .then((ds) => (isGuest ? ds : bulkService.enrichMyPledges(ds))),
    [user.lat, user.lng, isBulkView, radiusKm, isGuest],
    `hub:deals:${isBulkView ? radiusKm : "rail"}:${hubGeoKey}`
  );
  const deals = dealsData ?? [];
  // Urgency/momentum buckets, not the distance order the service returns —
  // see lib/bulkFeed.ts for why distance is the weakest signal here.
  const buckets = bucketCampaigns(deals);

  // Claim-pass banner — a shortcut, not the destination. The full list (issued
  // + redeemed passes, pools joined but not posted) lives at /community/activity.
  const { data: myTokens } = useQuery(
    () => (isGuest ? Promise.resolve([]) : bulkService.myTokens()),
    [user.id, isGuest],
    isGuest ? undefined : `bulk:tokens:${user.id}`
  );
  const issuedPassCount = (myTokens ?? []).filter((tk) => tk.status === "ISSUED").length;

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
        type: typeParam(postFilter as "ALL" | CommunityPostType),
        sort: postSort,
        query: searchQuery || undefined,
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

  // Pagination advances on scroll proximity, not a tap — a sentinel div 300px
  // before the end of the list triggers the same loadMorePosts a "Load more"
  // button used to. Re-observes whenever the cursor changes so a freshly
  // rendered sentinel (after a page lands) is watched again.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isSpecialView || !postsHasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMorePosts(); },
      { rootMargin: "300px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpecialView, postsHasMore, postCursor]);

  // New posts are counted, never auto-inserted — see useRealtimeInserts.
  const { newIds, reset: resetNewIds } = useRealtimeInserts("community_posts", { enabled: !isSpecialView });

  // UPDATE/DELETE, deliberately separate from useRealtimeInserts above. That
  // hook is INSERT-only by design (new posts are counted into a "N new posts"
  // banner rather than injected under the reader), so it never noticed an
  // author deleting a post or marking one resolved — the stale card just sat
  // there until a manual pull-to-refresh. Refetching is right for these two:
  // unlike an insert, a row vanishing or changing under you isn't something
  // the reader chose to defer.
  useEffect(() => {
    if (isSpecialView || !hasSupabaseEnv) return;
    const sb = getSupabase();
    const channel = sb
      .channel(`rt-upd:community_posts:${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "community_posts" }, () => refetchPosts())
      .on("postgres_changes" as any, { event: "DELETE", schema: "public", table: "community_posts" }, () => refetchPosts())
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpecialView]);

  async function refreshFeed() {
    resetNewIds();
    refetchPosts();

    refetchDeals();
  }

  const { containerRef, pullDistance, refreshing } = usePullToRefresh<HTMLDivElement>(refreshFeed);

  // An empty neighbourhood is usually a radius artifact, not genuinely nothing
  // happening — communityService/requestService both default to 5km (or a
  // smaller stored settings_radius). Both read localStorage fresh on every
  // call, so bumping it here and refetching is enough; no extra dep wiring.
  /** The single write path for this screen's radius. Persists to the key every
   *  nearby-query in the app reads, then refetches BOTH feeds — so changing it
   *  once moves posts and campaigns together instead of only one of them. */
  function applyRadius(km: number) {
    setRadiusKm(km);
    localStorage.setItem("settings_radius", String(km));
    refetchPosts();
    refetchDeals();
  }

  function widenRadius() {
    applyRadius(Math.max(radiusKm, WIDEN_RADIUS_KM));
  }

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
  const stream = posts;
  const dealsRail = postFilter === "ALL" ? deals.slice(0, 3) : [];

  function hidePost(postId: string) {
    setHiddenPosts(addToIdList(HIDDEN_POSTS_KEY, postId, localStorage));
  }

  function muteAuthor(authorId: string) {
    setMutedAuthors(addToIdList(MUTED_AUTHORS_KEY, authorId, localStorage));
  }

  function onBook(d: BulkDeal) {
    requireAuth(() => setOrdering(d), "Sign in to order in bulk")();
  }

  // A seller viewing the public hub still composes under their active identity.
  const isOwnerContext = activeContext.type !== "customer" && !!activeContext.id;
  const goToCompose = requireAuth(() => {
    nav(
      "/community/new",
      isOwnerContext
        ? { state: activeContext.type === "business"
            ? { businessId: activeContext.id, businessName: activeContext.name }
            : { providerId: activeContext.id, providerName: activeContext.name } }
        : undefined
    );
  }, "Sign in to post on your street");

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
    <div className="screen with-nav community-hub-screen">
      {/* Header carries only 4 things now: back · title · filter/sort ·
          create. Everything else that used to be pinned here (stories,
          the compose prompt, the "Post a request" button, the filter chip
          strip) scrolls with the content instead — see the scroll region
          below. The material (glass blur + hairline) is untouched; it
          already reads as a proper iOS nav bar, it just had too much
          stacked underneath it. */}
      <header className="community-hub-header">
        <div className="community-hub-top">
          <button
            className="icon-btn"
            onClick={handleBack}
            aria-label={t("go_back")}
            style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--ink-100)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={19} />
          </button>
          <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 20, letterSpacing: "-0.4px", lineHeight: 1.2, color: "var(--ink-900)" }}>
              {t("community_header")}
            </div>
            {/* Location AND radius, in one always-reachable control. Radius
                used to be buried in the bulk list (and absent entirely for
                posts) — but "how far am I looking?" is the question that
                actually changes what's on screen, so it belongs next to the
                place name, in the sticky header. */}
            <button
              className="tiny semi row gap-4 ellipsis"
              onClick={() => { haptics.selection(); setMoreOpen(true); }}
              aria-label={t("change_radius")}
              style={{
                color: "var(--brand-700)",
                background: "var(--brand-50)",
                padding: "2.5px 9px",
                borderRadius: 12,
                width: "fit-content",
                border: "1px solid var(--brand-150)",
                fontSize: 11.5,
                letterSpacing: "-0.1px",
                cursor: "pointer",
              }}
            >
              <MapPin size={11} /> {area} · {radiusLabel(radiusKm)}
            </button>
          </div>
          {/* Persistent entry to /community/activity — the ONLY other way in
              was a banner gated on issuedPassCount > 0, so a customer who had
              only pledged (no claim pass minted yet — that only happens once
              the campaign closes) had no way at all to check their status.
              Always visible once signed in; the dot is just a hint, not the
              only door. */}
          {!isGuest && (
            <button
              className="icon-btn"
              style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--ink-100)", color: "var(--ink-700)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}
              onClick={() => nav("/community/activity")}
              aria-label={t("your_activity_label")}
            >
              <Ticket size={19} />
              {issuedPassCount > 0 && (
                <span style={{ position: "absolute", top: 6, right: 7, width: 8, height: 8, borderRadius: "50%", background: "var(--red-500)", border: "2px solid var(--surface)" }} />
              )}
            </button>
          )}
          <button
            className="icon-btn"
            style={{ width: 44, height: 44, borderRadius: "50%", background: searchOpen || searchQuery ? "var(--brand-100)" : "var(--ink-100)", color: searchOpen || searchQuery ? "var(--brand-700)" : "var(--ink-700)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onClick={() => {
              setSearchOpen((v) => {
                // Closing the bar has to clear the search too, or the feed stays
                // silently filtered with nothing on screen saying why.
                if (v) { setSearchInput(""); setSearchQuery(""); }
                return !v;
              });
            }}
            aria-expanded={searchOpen}
            aria-label={t("search_posts_label")}
          >
            <Search size={19} />
          </button>
          <button
            className="icon-btn"
            style={{ width: 44, height: 44, borderRadius: "50%", background: isLongTailFilter ? "var(--brand-100)" : "var(--ink-100)", color: isLongTailFilter ? "var(--brand-700)" : "var(--ink-700)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onClick={() => setMoreOpen(true)}
            aria-label={t("filter_and_sort_title")}
          >
            <SlidersHorizontal size={19} />
          </button>
          <button
            className="icon-btn"
            style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--brand-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onClick={goToCompose}
            aria-label={t("post_word")}
          >
            <Plus size={20} />
          </button>
        </div>
        {searchOpen && (
          <div className="row gap-8 center-v" style={{ margin: "8px 2px 0", border: "1.5px solid var(--ink-200)", borderRadius: 999, padding: "0 12px", background: "var(--surface)" }}>
            <Search size={15} color="var(--ink-400)" />
            <input
              className="input"
              style={{ border: "none", background: "transparent", padding: "9px 0", fontSize: 14 }}
              autoFocus
              value={searchInput}
              placeholder={t("search_posts_placeholder")}
              aria-label={t("search_posts_label")}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label={t("clear_word")} onClick={() => setSearchInput("")}>
                <X size={14} />
              </button>
            )}
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

        {/* Stories — discovery content, not navigation, so it scrolls away
            like everything else here instead of sitting permanently under
            the nav bar. */}
        <div style={{ margin: "0 -16px 4px", paddingTop: 10 }}>
          <StoriesBar />
        </div>

        {/* No separate "start a post" prompt bar here — the header's + is
            the one, persistent way to compose, reachable at any scroll
            position. A second, adjacent invitation to do the exact same
            thing read as redundant right at first glance, on top of
            Stories' own "+" a few pixels above it. */}

        {/* Filter row — capped at six. The four longer-tail post types live
            in the "More" sheet's Show section instead of crowding this row;
            the sheet button picks up an active tint when one of them is the
            current filter, so there's still a visible signal. */}
        <div className="hscroll community-hub-filters">
          <button className={`chip-pill ${postFilter === "ALL" ? "active" : ""}`} onClick={() => setPostFilter("ALL")}>
            {t("filter_all")}
          </button>
          <button className={`chip-pill ${isBulkView ? "active" : ""}`} onClick={() => setPostFilter("BULK")}>
            {t("filter_bulk_buying")}
          </button>
          <button className={`chip-pill ${postFilter === "ALERT" ? "active" : ""}`} onClick={() => setPostFilter("ALERT")}>
            {t("type_alert")}
          </button>
          <button className={`chip-pill ${postFilter === "LOST_FOUND" ? "active" : ""}`} onClick={() => setPostFilter("LOST_FOUND")}>
            {t("type_lost_found")}
          </button>
          <button className={`chip-pill ${isLongTailFilter ? "active" : ""}`} onClick={() => setMoreOpen(true)}>
            {t("more_ellipsis")}
          </button>
        </div>

        {/* "N new posts" — the arrival is announced, never injected. Yanking the
            list while someone is reading is the most disorienting thing a feed
            can do, so the reader decides when to jump. Sticky so it stays
            reachable after scrolling past the header, instead of scrolling
            away with everything above it. */}
        {!isSpecialView && unseenCount > 0 && (
          <button
            className="feed-new-pill"
            style={{ position: "sticky", top: 8, zIndex: 5 }}
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

        {/* Claim-pass banner — a shortcut to /community/activity, not a modal
            opened from here. With >1 pass the banner can't guess which one you
            want, and activity is the one place that lists all of them anyway. */}
        {!isSpecialView && issuedPassCount > 0 && (
          <div className="page-pad" style={{ paddingBottom: 0 }}>
            <button
              className="card row gap-10 center-v"
              style={{ width: "100%", padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-200)" }}
              onClick={() => nav("/community/activity")}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ticket size={16} color="var(--brand-700)" />
              </div>
              <span className="semi small grow" style={{ textAlign: "left", color: "var(--brand-800)" }}>
                {issuedPassCount === 1 ? t("claim_passes_ready_one") : tf("claim_passes_ready_other", { n: issuedPassCount })}
              </span>
            </button>
          </div>
        )}

        {isBulkView ? (
          <div className="page-pad col gap-16" style={{ paddingBottom: 32 }}>
            {dealsLoading ? (
              <ListSkeleton count={3} />
            ) : deals.length === 0 ? (
              <>
                <EmptyState emoji="🏷️" title={t("no_bulk_deals_nearby")} text={t("no_bulk_deals_desc")} />
              </>
            ) : (
              <>
                {/* Orientation in one line, before any scrolling. */}
                <div className="row gap-6" style={{ flexWrap: "wrap" }}>
                  <span className="badge" style={{ background: "var(--amber-50)", color: "var(--amber-800)", fontSize: 11 }}>
                    {tf("n_campaigns_nearby", { n: deals.length })}
                  </span>
                  {buckets.mine.length > 0 && (
                    <span className="badge" style={{ background: "var(--green-100)", color: "var(--green-600)", fontSize: 11 }}>
                      {tf("n_you_joined", { n: buckets.mine.length })}
                    </span>
                  )}
                  {buckets.closing.length > 0 && (
                    <span className="badge" style={{ background: "var(--red-50)", color: "var(--red-600)", fontSize: 11 }}>
                      {tf("n_closing_soon", { n: buckets.closing.length })}
                    </span>
                  )}
                </div>

                {/* Your pledges — compact action rows, not full cards. The one
                    thing here that can cost you something is an unpaid deposit:
                    the server only counts PAID pledges toward a campaign's
                    target, so an unpaid one is holding no spot at all. That was
                    invisible anywhere in the browse feed before. */}
                {buckets.mine.length > 0 && (
                  <div className="col gap-8">
                    <div className="row gap-6 center-v small semi muted">
                      <CheckCircle2 size={14} color="var(--green-600)" /> {t("your_pledges")}
                    </div>
                    {buckets.mine.map((d) => {
                      const owing = needsDeposit(d);
                      return (
                        <button
                          key={d.id}
                          className="card row gap-10 center-v"
                          style={{
                            padding: 12, width: "100%", textAlign: "left",
                            background: owing ? "var(--amber-50)" : "var(--surface)",
                            border: owing ? "1px solid var(--amber-500)" : undefined,
                          }}
                          onClick={() => onBook(d)}
                        >
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="semi small ellipsis">{d.title}</div>
                            <div className="tiny muted">
                              {tf("pledged_n_units", { n: d.myPledgeQuantity ?? 0 })}
                              {d.businessName ? ` · ${d.businessName}` : ""}
                            </div>
                          </div>
                          {owing ? (
                            <span className="badge" style={{ background: "var(--amber-500)", color: "var(--ink-900)", fontSize: 10, flexShrink: 0 }}>
                              {tf("pay_deposit_cta", { amount: inr(d.depositAmount ?? 0) })}
                            </span>
                          ) : (
                            <span className="badge" style={{ background: "var(--green-100)", color: "var(--green-600)", fontSize: 10, flexShrink: 0 }}>
                              {d.myDepositStatus === "PENDING_CONFIRM" ? t("deposit_pending_short") : t("locked_in_short")}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Urgency before proximity — a deadline is the only hard
                    reason to act now, and momentum is what makes a campaign
                    likely to actually happen. Distance barely matters when
                    fulfilment is a later batch. */}
                <BulkGroup title={t("closing_soon")} emoji="⏰" deals={buckets.closing} onBook={onBook} />
                <BulkGroup title={t("almost_there")} emoji="🔥" deals={buckets.almost} onBook={onBook} />
                <BulkGroup title={t("open_to_join")} emoji="🛒" deals={buckets.open} onBook={onBook} />

              </>
            )}
          </div>
        ) : (
          postsLoading ? <ListSkeleton count={3} type="post" /> :
          postsError   ? <ErrorView error={postsError} onRetry={refetchPosts} /> :
          stream.length === 0 ? (
            // "Nothing matched" and "nobody has posted" are different problems
            // with different fixes — offering "post something" to a failed
            // search reads as a non-sequitur.
            searchQuery ? (
              <EmptyState
                emoji="🔍"
                title={t("no_posts_match_search")}
                text={t("no_posts_match_search_desc")}
                action={
                  <button className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(""); setSearchQuery(""); }}>
                    {t("clear_search_word")}
                  </button>
                }
              />
            ) : (
            <EmptyState
              emoji="🏘️"
              title={t("nothing_posted_yet")}
              text={t("nothing_posted_desc")}
              action={
                <div className="col gap-8" style={{ alignItems: "center" }}>
                  <button className="btn btn-primary btn-sm" onClick={widenRadius}>
                    {tf("widen_to_n_km", { n: WIDEN_RADIUS_KM })}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={goToCompose}>
                    <Plus size={15} /> {t("post_something")}
                  </button>
                </div>
              }
            />
            )
          ) : (
            <div className="col gap-12 page-pad" style={{ paddingBottom: 32 }}>
              {/* Bulk deals rail — a labelled, horizontal, clearly-commercial
                  section, never a card inline in the vertical neighbour
                  stream. Only on the unfiltered view, and only when there's
                  something to show. */}
              {dealsRail.length > 0 && (
                <Section title={t("bulk_deals_from_shops_nearby")} action={t("see_all_word")} onAction={() => setPostFilter("BULK")}>
                  <div className="hscroll" style={{ padding: "10px 2px 2px" }}>
                    {dealsRail.map((d) => (
                      <div key={d.id} style={{ minWidth: 260, scrollSnapAlign: "start" }}>
                        <BulkDealCard deal={d} onBook={onBook} />
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {stream.map((post) => (
                <CommunityCard
                  key={post.id}
                  post={post}
                  onRefetch={refetchPosts}
                  onHide={hidePost}
                  onMute={muteAuthor}
                />
              ))}
              {/* No longer gated on postFilter === "ALL": the filter is part of
                  the query now, so the next page is the next page OF THIS FILTER.
                  No tap required either — the sentinel below fires loadMorePosts
                  once it nears the viewport (see the IntersectionObserver effect
                  above); the skeleton is what's actually visible, the 1px div is
                  just the trigger. */}
              {postsHasMore && (
                <div ref={loadMoreRef} style={{ marginTop: 8 }}>
                  {loadingMorePosts && <PostCardSkeleton />}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Filter & sort — the single sheet the header's filter glyph and the
          chip row's "More…" both open. Consolidates what used to be two
          separate sheets (a filter selector that didn't exist, and a
          sort-only sheet) into one, since both are "how do I see the feed
          differently" questions. */}
      {moreOpen && (
        <div className="overlay" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("filter_and_sort_title")}>
            <div className="sheet-grab" />
            <div className="bold" style={{ fontSize: 17, marginBottom: 14 }}>{t("filter_and_sort_title")}</div>

            {/* First in the sheet, because it's the control that changes the
                most: it drives posts and campaigns alike. RadiusSelector
                brings its own Custom input + snap preview. */}
            <div style={{ marginBottom: 18 }}>
              <RadiusSelector
                value={radiusKm}
                onChange={applyRadius}
                label={t("search_radius")}
                description={t("radius_applies_to_all")}
              />
            </div>

            <div className="tiny semi muted" style={{ marginBottom: 8 }}>{t("show_section_label")}</div>
            <div className="row wrap gap-8" style={{ marginBottom: 18 }}>
              {LONG_TAIL_TYPES.map((type) => (
                <button
                  key={type}
                  className={`chip-pill ${postFilter === type ? "active" : ""}`}
                  onClick={() => {
                    haptics.selection();
                    setPostFilter(type);
                    setMoreOpen(false);
                  }}
                >
                  {t(TYPE_LABEL_KEY[type])}
                </button>
              ))}
            </div>

            <div className="tiny semi muted" style={{ marginBottom: 8 }}>{t("sort_by_label")}</div>
            <div className="col gap-8" role="radiogroup" aria-label={t("sort_by_label")} style={{ marginBottom: 18 }}>
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
                      if (postFilter === "BULK") setPostFilter("ALL");
                      setMoreOpen(false);
                    }}
                  >
                    <span style={{ fontSize: 18 }} aria-hidden="true">{s.emoji}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="semi small" style={{ display: "block", color: on ? "var(--brand-900)" : "var(--ink-900)" }}>{t(SORT_LABEL_KEY[s.value])}</span>
                      <span className="tiny muted">{t(SORT_HINT_KEY[s.value])}</span>
                    </span>
                    {on && <Check size={16} color="var(--brand-600)" />}
                  </button>
                );
              })}
            </div>

            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setMoreOpen(false)}>{t("cancel_action")}</button>
          </div>
        </div>
      )}

      {ordering && (
        <BulkOrderSheet
          deal={ordering}
          onOrdered={() => refetchDeals()}
          onClose={() => setOrdering(null)}
        />
      )}
    </div>
  );
}

/** One urgency bucket. Renders nothing when empty, so the page never shows a
 *  heading over a blank space — the old view's single "deals nearby" section
 *  had to render its own empty state instead. */
function BulkGroup({
  title, emoji, deals, onBook,
}: { title: string; emoji: string; deals: BulkDeal[]; onBook: (d: BulkDeal) => void }) {
  if (deals.length === 0) return null;
  return (
    <div className="col gap-10">
      <div className="row gap-6 center-v small semi muted">
        <span aria-hidden>{emoji}</span> {title}
        <span className="tiny muted" style={{ fontWeight: 500 }}>({deals.length})</span>
      </div>
      {deals.map((d) => <BulkDealCard key={d.id} deal={d} onBook={onBook} />)}
    </div>
  );
}

