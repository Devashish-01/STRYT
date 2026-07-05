import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MapPin, MessageCircle, Search as SearchIcon, FileText, ArrowLeft } from "@/components/Icons";
import { requestService, communityService, discoveryService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard } from "@/components/cards";
import { CommunityCard } from "@/screens/Community";
import { EmptyState } from "@/components/common";
import { useApp } from "@/store";
import type { CommunityPostType } from "@/types";

type HubTab = "requests" | "posts";

const POST_FILTERS: ("ALL" | CommunityPostType)[] = ["ALL", "ALERT", "LOST_FOUND", "RECOMMENDATION", "GIVEAWAY", "POLL", "SHOUTOUT"];
const POST_LABELS: Record<"ALL" | CommunityPostType, string> = {
  ALL: "All", ALERT: "📢 Alert", LOST_FOUND: "🔍 Lost & Found",
  RECOMMENDATION: "💬 Ask", GIVEAWAY: "🎁 Giveaway", POLL: "📊 Poll", SHOUTOUT: "🙌 Shoutout",
};

export default function CommunityHub() {
  const nav = useNavigate();
  const { area, user, chatUnread, activeContext } = useApp();
  const [tab, setTab] = useState<HubTab>("posts");
  const [postFilter, setPostFilter] = useState<"ALL" | CommunityPostType>("ALL");
  const [reqSpecial, setReqSpecial] = useState<"all" | "urgent" | "group" | "recurring">("all");

  const { data: feedPage, loading: reqLoading, error: reqError, refetch: refetchReq } = useQueryWithRealtime(
    () => requestService.feed({ lat: user.lat || 0, lng: user.lng || 0 }),
    "requests",
    [user.lat, user.lng]
  );
  const { data: postData, loading: postsLoading, error: postsError, refetch: refetchPosts } = useQuery(
    () => communityService.feed({ lat: user.lat || undefined, lng: user.lng || undefined }),
    [user.lat, user.lng]
  );
  const { data: bizPage } = useQuery(() => discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);
  const { data: provPage } = useQuery(() => discoveryService.providers({ lat: user.lat || undefined, lng: user.lng || undefined }), [user.lat, user.lng]);

  const allRequests = feedPage?.data ?? [];
  let requests = allRequests;
  if (reqSpecial === "urgent")    requests = requests.filter((r) => r.isUrgent);
  if (reqSpecial === "group")     requests = requests.filter((r) => r.isGroupBuy);
  if (reqSpecial === "recurring") requests = requests.filter((r) => r.isRecurring);

  const allPosts = postData ?? [];
  const posts = postFilter === "ALL" ? allPosts : allPosts.filter((p) => p.type === postFilter);

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
        <div style={{ padding: "14px 16px 0" }}>
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
                onClick={() => nav("/chats")}
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
              {posts.map((p) => (
                <CommunityCard
                  key={p.id}
                  post={p}
                  businesses={bizPage?.data ?? []}
                  providers={provPage?.data ?? []}
                  onRefetch={refetchPosts}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
