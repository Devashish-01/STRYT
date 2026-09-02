import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText } from "@/components/Icons";
import { requestService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { RequestCard } from "@/components/cards";
import { EmptyState } from "@/components/common";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import type { RequestPost } from "@/types";

type View = "nearby" | "mine";

interface RequestsFeedPanelProps {
  /** Explore's universal category filter, already resolved from a catalog
   *  id to the name requestService.feed() actually matches on. null = no
   *  category selected. Only applies to "Nearby" — "Mine" is your own
   *  posts, not something a neighbourhood-wide category filter should hide. */
  categoryName: string | null;
  /** Explore's shared radius control. */
  radius: number;
}

// The body of the former standalone /requests screen, now embedded as
// Explore's "Requests" tab — Explore already supplies the screen shell,
// header, and (via categoryName/radius above) the universal filters, so
// this panel owns only what's actually specific to browsing requests: the
// Nearby/Mine split, urgent/group/recurring filters, and pagination.
export default function RequestsFeedPanel({ categoryName, radius }: RequestsFeedPanelProps) {
  const nav = useNavigate();
  const { area, user, showToast } = useApp();
  const { t } = useI18n();
  const [params] = useSearchParams();
  // `?view=mine` lets a caller (Profile's "My requests" tile) land straight
  // on the user's own requests — same lazy-initializer pattern Explore
  // already uses for `?cat=`. Named "view" rather than the old screen's
  // "tab" because Explore's own tab selector now owns that query param.
  const [view, setView] = useState<View>(params.get("view") === "mine" ? "mine" : "nearby");
  const [special, setSpecial] = useState<"all" | "urgent" | "group" | "recurring">("all");

  const geoKey = `${(user.lat ?? 0).toFixed(2)}:${(user.lng ?? 0).toFixed(2)}`;
  const { data: feedPage, loading: feedLoading, error: feedError, refetch } = useQueryWithRealtime(
    () => requestService.feed({ lat: user.lat || 0, lng: user.lng || 0, category: categoryName ?? undefined, radiusKm: radius }),
    "requests",
    [user.lat, user.lng, categoryName, radius],
    undefined,
    `explore:requests:nearby:${categoryName ?? "all"}:${radius}:${geoKey}`
  );
  const { data: mineList, loading: mineLoading } = useQueryWithRealtime(() => requestService.mine(user.lat || 0, user.lng || 0), "requests", [user.lat, user.lng], undefined, `explore:requests:mine:${user.id}`);

  // Pagination: the first page comes from the realtime-backed query above; any
  // further pages are appended here via the service's cursor.
  const [extra, setExtra] = useState<RequestPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setExtra([]);
    setCursor(feedPage?.page?.next_cursor ?? null);
    setHasMore(feedPage?.page?.has_more ?? false);
  }, [feedPage]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await requestService.feed({ lat: user.lat || 0, lng: user.lng || 0, cursor, category: categoryName ?? undefined, radiusKm: radius });
      setExtra((prev) => [...prev, ...(next.data ?? [])]);
      setCursor(next.page?.next_cursor ?? null);
      setHasMore(next.page?.has_more ?? false);
    } catch {
      showToast(t("couldnt_load_more"));
    } finally {
      setLoadingMore(false);
    }
  }

  const feed = [...(feedPage?.data ?? []), ...extra];
  const mine = mineList ?? [];

  let nearby = feed;
  if (special === "urgent") nearby = nearby.filter((r) => r.isUrgent);
  if (special === "group") nearby = nearby.filter((r) => r.isGroupBuy);
  if (special === "recurring") nearby = nearby.filter((r) => r.isRecurring);
  const list = view === "nearby" ? nearby : mine;
  const loading = view === "nearby" ? feedLoading : mineLoading;

  return (
    <div>
      <div className="page-pad" style={{ paddingBottom: 0 }}>
        <div className="row between center-v" style={{ marginBottom: 4 }}>
          <div className="row" style={{ borderBottom: "1px solid var(--line)", flex: 1 }}>
            {([["nearby", t("nearby_label")], ["mine", t("my_requests_label")]] as [View, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="semi"
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 14,
                  color: view === v ? "var(--brand-700)" : "var(--ink-500)",
                  borderBottom: view === v ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 12 }} onClick={() => nav("/ask")}>
            <Plus size={16} /> {t("ask")}
          </button>
        </div>
        <span className="tiny muted">{t("open_needs_near")} {area}</span>
      </div>

      {view === "nearby" && (
        <div className="hscroll" style={{ paddingTop: 12, paddingBottom: 0 }}>
          {([["all", t("all")], ["urgent", t("urgent_label")], ["group", t("group_buys")], ["recurring", t("recurring_label")]] as const).map(([s, label]) => (
            <button key={s} className={`chip ${special === s ? "active" : ""}`} onClick={() => setSpecial(s)}>{label}</button>
          ))}
        </div>
      )}

      <div className="col gap-12 page-pad">
        {loading ? (
          <ListSkeleton count={3} type="request" />
        ) : feedError && view === "nearby" ? (
          <ErrorView error={feedError} onRetry={refetch} />
        ) : list.length === 0 ? (
          <EmptyState
            emoji="📭"
            title={view === "mine" ? t("no_requests_yet") : t("all_quiet_nearby")}
            text={view === "mine" ? t("post_first_request_desc") : t("no_open_requests_desc")}
            action={
              <button className="btn btn-primary btn-sm" onClick={() => nav("/ask")}>
                <FileText size={16} /> {t("post_request")}
              </button>
            }
          />
        ) : (
          list.map((r) => <RequestCard key={r.id} r={r} />)
        )}

        {view === "nearby" && !loading && !feedError && hasMore && (
          <button
            className="btn btn-ghost btn-block"
            onClick={loadMore}
            disabled={loadingMore}
            style={{ marginTop: 4 }}
          >
            {loadingMore ? t("loading") : t("load_more")}
          </button>
        )}
      </div>
    </div>
  );
}
