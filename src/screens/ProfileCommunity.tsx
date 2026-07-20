import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Globe, FileText } from "@/components/Icons";
import { communityService, businessService, providerService, requestService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard, CommunityCard } from "@/components/cards";
import { AppBar, EmptyState } from "@/components/common";
import { useApp } from "@/store";
import ManageNav from "@/screens/business/manage/ManageNav";
import ProviderManageNav from "@/screens/provider/manage/ProviderManageNav";

type Kind = "business" | "provider";
type Tab = "posts" | "requests";

/**
 * A community view dedicated to ONE business/provider profile — reached from
 * that profile's manage dashboard, so the owner stays inside their own console
 * (their manage nav, their identity) instead of being dropped into the shared
 * customer /community-hub. Two tabs:
 *  • Posts    — community posts authored as this profile.
 *  • Requests — requests this account has posted (requests are user-scoped;
 *               there is no request→profile FK, so this is requestService.mine()).
 * New posts/requests are composed under this profile's identity.
 */
export function ProfileCommunity({ kind }: { kind: Kind }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user } = useApp();
  const [tab, setTab] = useState<Tab>("posts");

  const { data: profile } = useQuery<any>(
    () => (kind === "business" ? businessService.get(id) : providerService.get(id)),
    [id],
    kind === "business" ? `business:${id}` : `provider:${id}`
  );
  const { data: posts, loading: postsLoading, error: postsError, refetch: refetchPosts } = useQueryWithRealtime(
    () => communityService.byAuthorRef(kind, id),
    "community_posts",
    [id],
    `author_ref_id=eq.${id}`
  );
  const { data: myRequests, loading: reqLoading, error: reqError, refetch: refetchReq } = useQueryWithRealtime(
    () => requestService.mine(user.lat || 0, user.lng || 0),
    "requests",
    [user.lat, user.lng],
    user.id ? `requester_user_id=eq.${user.id}` : undefined
  );
  const name = kind === "business" ? profile?.name ?? "Business" : profile?.displayName ?? "Provider";
  const avatar = kind === "business" ? profile?.coverImage : profile?.avatar;

  function goToCompose() {
    nav("/community/new", {
      state: kind === "business"
        ? { businessId: id, businessName: name, businessAvatar: avatar }
        : { providerId: id, providerName: name, providerAvatar: avatar },
    });
  }

  const postList = posts ?? [];
  const reqList = myRequests ?? [];

  return (
    <div className="screen with-nav">
      <AppBar
        title="My Community"
        subtitle={name}
        right={
          <button className="icon-btn" onClick={tab === "posts" ? goToCompose : () => nav("/ask")} aria-label={tab === "posts" ? "New post" : "New request"}>
            <Plus size={20} />
          </button>
        }
      />

      {/* Tabs */}
      <div className="row page-pad" style={{ gap: 0, paddingBottom: 0, paddingTop: 8, borderBottom: "1px solid var(--line)" }}>
        {([["posts", `🏘️ Posts (${postList.length})`], ["requests", `📋 Requests (${reqList.length})`]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="semi"
            style={{ flex: 1, padding: "10px 0", fontSize: 14, color: tab === t ? "var(--brand-700)" : "var(--ink-500)", borderBottom: tab === t ? "2.5px solid var(--brand-700)" : "2.5px solid transparent" }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="screen-scroll">
        {/* Jump to the public neighborhood feed */}
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ border: "1.5px solid var(--ink-200)", fontWeight: 700 }}
            onClick={() => nav("/community-hub")}
          >
            <Globe size={14} /> View neighborhood feed
          </button>
        </div>

        {tab === "posts" && (
          postsLoading ? <ListSkeleton count={3} /> :
          postsError ? <ErrorView error={postsError} onRetry={refetchPosts} /> :
          postList.length === 0 ? (
            <EmptyState
              emoji="🏘️"
              title="No posts yet"
              text="Share an update, offer, or shoutout with nearby customers — it appears in the neighborhood feed under your name."
              action={
                <button className="btn btn-primary btn-sm" onClick={goToCompose}>
                  <Plus size={15} /> Post something
                </button>
              }
            />
          ) : (
            <div className="col gap-12 page-pad" style={{ paddingBottom: 24 }}>
              {postList.map((p) => (
                <CommunityCard key={p.id} post={p} onRefetch={refetchPosts} />
              ))}
            </div>
          )
        )}

        {tab === "requests" && (
          reqLoading ? <ListSkeleton count={3} /> :
          reqError ? <ErrorView error={reqError} onRetry={refetchReq} /> :
          reqList.length === 0 ? (
            <EmptyState
              emoji="📋"
              title="No requests yet"
              text="Requests you post appear here — put out a call for a supplier, service, or anything you need nearby."
              action={
                <button className="btn btn-primary btn-sm" onClick={() => nav("/ask")}>
                  <FileText size={15} /> Post a request
                </button>
              }
            />
          ) : (
            <div className="col gap-12 page-pad" style={{ paddingBottom: 24 }}>
              {reqList.map((r) => <RequestCard key={r.id} r={r} />)}
            </div>
          )
        )}
      </div>

      {kind === "business" ? <ManageNav bizId={id} /> : <ProviderManageNav pid={id} />}
    </div>
  );
}

export default function BusinessCommunity() {
  return <ProfileCommunity kind="business" />;
}
