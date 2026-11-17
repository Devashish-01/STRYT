import { useState } from "react";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { useApp } from "@/store";
import { businessService, providerService, requestService, userService } from "@/services";
import { communityService } from "@/services/engagement/communityService";
import { useQuery } from "@/hooks/useApi";
import { BusinessCardWide, ProviderCard, RequestCard, CommunityCard } from "@/components/cards";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ListSkeleton, ErrorView } from "@/components/states";
import { UserCheck, Star } from "@/components/Icons";
import type { Business, Provider, RequestPost } from "@/types";
import { useI18n } from "@/lib/i18n";

type Tab = "BUSINESS" | "PROVIDER" | "REQUEST" | "POST" | "FOLLOWING";

export default function Bookmarks() {
  const { bookmarks, follows, user, toggleFollow } = useApp();
  const { t } = useI18n();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab")?.toUpperCase() as Tab) ?? "BUSINESS";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Fetched by ID, not from the generic "nearby" discovery feed filtered
  // client-side — that feed is capped (DEFAULT_LIMIT=20) and radius-scoped,
  // so a bookmark outside the first page (or a saved request that's since
  // closed, since feed() only returns OPEN/AGREED) silently vanished from
  // this screen even though the bookmark itself was untouched. Fetching by
  // ID means "saved" always shows what's actually saved.
  const bizIds = Array.from(new Set([
    ...bookmarks.filter((m) => m.type.toUpperCase() === "BUSINESS").map((m) => m.id),
    ...follows.filter((f) => f.type.toUpperCase() === "BUSINESS").map((f) => f.id),
  ]));
  const provIds = Array.from(new Set([
    ...bookmarks.filter((m) => m.type.toUpperCase() === "PROVIDER").map((m) => m.id),
    ...follows.filter((f) => f.type.toUpperCase() === "PROVIDER").map((f) => f.id),
  ]));
  const reqIds = Array.from(new Set(bookmarks.filter((m) => m.type.toUpperCase() === "REQUEST").map((m) => m.id)));
  const followUserKeys = follows.filter((f) => f.type.toUpperCase() === "USER");

  const { data: bizData, loading: bizLoading, error: bizError, refetch: refetchBiz } = useQuery(async () => {
    if (bizIds.length === 0) return [];
    return businessService.byIds(bizIds);
  }, [bizIds.join(",")], `bookmarks:biz-by-id:${user.id}:${bizIds.join(",")}`);

  const { data: provData, loading: provLoading, error: provError, refetch: refetchProv } = useQuery(async () => {
    if (provIds.length === 0) return [];
    return providerService.byIds(provIds);
  }, [provIds.join(",")], `bookmarks:prov-by-id:${user.id}:${provIds.join(",")}`);

  const { data: reqData, loading: reqLoading, error: reqError, refetch: refetchReq } = useQuery(async () => {
    if (reqIds.length === 0) return [];
    const rows = await Promise.all(reqIds.map((id) => requestService.get(id)));
    return rows.filter((r): r is RequestPost => !!r);
  }, [reqIds.join(",")], `bookmarks:req-by-id:${user.id}:${reqIds.join(",")}`);

  const { data: usersData, loading: usersLoading, error: usersError, refetch: refetchUsers } = useQuery(async () => {
    if (followUserKeys.length === 0) return [];
    const profiles = await Promise.all(
      followUserKeys.map((k) => userService.publicProfile(k.id))
    );
    return profiles.filter(Boolean);
  }, [followUserKeys.length], `bookmarks:followed-users:${user.id}:${followUserKeys.length}`);

  const allBiz = bizData ?? [];
  const allProv = provData ?? [];
  const allReq = reqData ?? [];
  const followUsers = usersData ?? [];

  const savedBiz = allBiz.filter((b) => bookmarks.some((m) => m.type.toUpperCase() === "BUSINESS" && m.id === b.id));
  const savedProv = allProv.filter((p) => bookmarks.some((m) => m.type.toUpperCase() === "PROVIDER" && m.id === p.id));
  const savedReq = allReq.filter((r) => bookmarks.some((m) => m.type.toUpperCase() === "REQUEST" && m.id === r.id));
  const followBiz = allBiz.filter((b) => follows.some((f) => f.type.toUpperCase() === "BUSINESS" && f.id === b.id));
  const followProv = allProv.filter((p) => follows.some((f) => f.type.toUpperCase() === "PROVIDER" && f.id === p.id));

  // Saved posts were write-only until now: toggleSave() persisted into
  // post_saves and communityService.savedPosts() was fully built, but had zero
  // callers anywhere — nothing in the app could show them back.
  // Server-backed, unlike the other tabs: saves live in post_saves, not in the
  // client-side `bookmarks` store, so there are no ids to fetch by.
  const { data: savedPostsData, loading: postsLoading, error: postsError, refetch: refetchPosts } = useQuery(
    () => (user.id ? communityService.savedPosts() : Promise.resolve([])),
    [user.id],
    user.id ? `saved-posts:${user.id}` : undefined
  );
  const savedPosts = savedPostsData ?? [];

  const counts = {
    BUSINESS: savedBiz.length,
    PROVIDER: savedProv.length,
    REQUEST: savedReq.length,
    POST: savedPosts.length,
    FOLLOWING: followBiz.length + followProv.length + followUsers.length,
  };


  return (
    <div className="screen">
      <AppBar title={t("saved_and_following")} />
      <div
        className="row"
        style={{ borderBottom: "1px solid var(--line)", background: "#fff", overflowX: "auto" }}
      >
        {(
          [
            ["BUSINESS", t("tab_shops")],
            ["PROVIDER", t("tab_providers")],
            ["REQUEST", t("tab_requests")],
            ["POST", t("tab_posts_saved")],
            ["FOLLOWING", t("tab_following")],
          ] as [Tab, string][]
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className="semi"
            style={{
              flex: 1,
              minWidth: 90,
              padding: "12px 0",
              fontSize: 13.5,
              whiteSpace: "nowrap",
              color: tab === tabKey ? "var(--brand-700)" : "var(--ink-500)",
              borderBottom: tab === tabKey ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
            }}
          >
            {label} {counts[tabKey] > 0 && `(${counts[tabKey]})`}
          </button>
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-14" style={{ paddingTop: 14 }}>
        {tab === "BUSINESS" && (
          bizLoading ? (
            <ListSkeleton count={3} />
          ) : bizError ? (
            <ErrorView error={bizError} onRetry={refetchBiz} />
          ) : savedBiz.length ? (
            savedBiz.map((b) => <BusinessCardWide key={b.id} b={b} />)
          ) : (
            <Empty nav={nav} />
          )
        )}

        {tab === "PROVIDER" && (
          provLoading ? (
            <ListSkeleton count={3} />
          ) : provError ? (
            <ErrorView error={provError} onRetry={refetchProv} />
          ) : savedProv.length ? (
            savedProv.map((p) => <ProviderCard key={p.id} p={p} />)
          ) : (
            <Empty nav={nav} />
          )
        )}

        {tab === "REQUEST" && (
          reqLoading ? (
            <ListSkeleton count={3} />
          ) : reqError ? (
            <ErrorView error={reqError} onRetry={refetchReq} />
          ) : savedReq.length ? (
            savedReq.map((r) => <RequestCard key={r.id} r={r} />)
          ) : (
            <Empty nav={nav} />
          )
        )}

        {tab === "POST" && (
          postsLoading ? (
            <ListSkeleton count={3} />
          ) : postsError ? (
            <ErrorView error={postsError} onRetry={refetchPosts} />
          ) : savedPosts.length ? (
            savedPosts.map((p) => <CommunityCard key={p.id} post={p} />)
          ) : (
            <Empty nav={nav} />
          )
        )}

        {tab === "FOLLOWING" && (
          (usersLoading || bizLoading || provLoading) ? (
            <ListSkeleton count={3} />
          ) : (usersError || bizError || provError) ? (
            <ErrorView
              error={usersError || bizError || provError!}
              onRetry={() => {
                if (usersError) refetchUsers();
                if (bizError) refetchBiz();
                if (provError) refetchProv();
              }}
            />
          ) : counts.FOLLOWING > 0 ? (
            <>
              {followUsers.map((u: any) => (
                <div
                  key={u.id}
                  className="card row space-between center-v"
                  style={{ padding: 14, borderRadius: 16 }}
                >
                  <button
                    type="button"
                    onClick={() => nav(`/u/${u.id}`)}
                    className="row gap-12 center-v"
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      flex: 1,
                      minWidth: 0,
                    }}
                    aria-label={`View ${u.name}'s profile`}
                  >
                    <SafeImg
                      src={u.avatar}
                      variant="avatar"
                      style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="bold small ellipsis">{u.name}</div>
                      <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                        <Star size={11} fill="var(--amber-500)" stroke="none" /> {u.ratingAvg} • 📍 {u.area || t("member_word")}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm row gap-4 center"
                    onClick={() => toggleFollow("USER", u.id, u.name)}
                    style={{
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      background: "var(--brand-100)",
                      color: "var(--brand-700)",
                      border: "none",
                      flexShrink: 0,
                    }}
                  >
                    <UserCheck size={14} /> {t("following")}
                  </button>
                </div>
              ))}
              {followProv.map((p) => (
                <ProviderCard key={p.id} p={p} />
              ))}
              {followBiz.map((b) => (
                <BusinessCardWide key={b.id} b={b} />
              ))}
            </>
          ) : (
            <EmptyState
              emoji="➕"
              title={t("not_following_anyone")}
              text={t("not_following_desc")}
              action={
                <button className="btn btn-ghost btn-sm" onClick={() => nav("/explore")}>
                  {t("find_some")}
                </button>
              }
            />
          )
        )}
      </div>
    </div>
  );
}

function Empty({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  const { t } = useI18n();
  return (
    <EmptyState
      emoji="🤍"
      title={t("nothing_saved_yet")}
      text={t("nothing_saved_bookmarks_desc")}
      action={
        <button className="btn btn-ghost btn-sm" onClick={() => nav("/explore")}>
          {t("explore_now")}
        </button>
      }
    />
  );
}
