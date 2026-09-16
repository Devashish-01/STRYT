import { useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { AppBar, StarRow, SafeImg } from "@/components/common";
import { businessService, providerService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { Flag, Reply, Trash2, Edit3 } from "@/components/Icons";
import ReportSheet from "@/components/ReportSheet";
import ManageNav from "./ManageNav";
import ProviderManageNav from "@/screens/provider/manage/ProviderManageNav";
import type { Review } from "@/types";

export default function ReviewsManager() {
  const { id = "" } = useParams();
  const loc = useLocation();
  const isProvider = loc.pathname.startsWith("/provider");
  const [filter, setFilter] = useState<number | null>(null);

  const { data, loading, error, refetch } = useQueryWithRealtime(
    () => (isProvider ? providerService.reviews(id) : businessService.reviews(id)),
    "ratings",
    [id, isProvider],
    `ratee_id=eq.${id}`
  );

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Reviews" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  const reviews = data ?? [];
  const list = filter ? reviews.filter((r) => r.rating === filter) : reviews;
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "—";

  return (
    <div className="screen with-nav">
      <AppBar title="Reviews" subtitle={filter ? `${avg}★ • ${list.length} of ${reviews.length} reviews` : `${avg}★ • ${reviews.length} reviews`} />
      <div className="screen-scroll">
        <div className="hscroll" style={{ paddingTop: 12 }}>
          <button className={`chip ${filter === null ? "active" : ""}`} onClick={() => setFilter(null)}>All</button>
          {[5, 4, 3, 2, 1].map((s) => (
            <button key={s} className={`chip ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>{s} ★</button>
          ))}
        </div>
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {!loading && !error && list.length === 0 && (
          <div className="empty col center" style={{ padding: "48px 16px", textAlign: "center" }}>
            <span style={{ fontSize: 36 }}>⭐</span>
            <div className="bold small" style={{ marginTop: 12 }}>No reviews {filter ? `with ${filter} stars` : "yet"}</div>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {filter ? "Try selecting 'All' to see all customer reviews." : "Customer reviews will appear here once submitted."}
            </div>
          </div>
        )}
        {!loading && !error && list.length > 0 && (
          <div className="page-pad col gap-14" style={{ paddingBottom: 24 }}>
            {list.map((r) => (
              <ReviewItem key={r.id} r={r} isProvider={isProvider} onReplied={refetch} />
            ))}
          </div>
        )}
      </div>
      {isProvider ? <ProviderManageNav pid={id} /> : <ManageNav bizId={id} />}
    </div>
  );
}

function ReviewItem({ r, isProvider, onReplied }: { r: Review; isProvider: boolean; onReplied: () => void }) {
  const { showToast } = useApp();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(r.ownerReply || "");
  const [posting, setPosting] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function postReply() {
    setPosting(true);
    try {
      if (isProvider) {
        await providerService.replyToReview(r.id, reply.trim());
      } else {
        await businessService.replyToReview(r.id, reply.trim());
      }
      showToast(r.ownerReply ? "Reply updated" : "Reply posted");
      setReplying(false);
      onReplied();
    } catch (e: any) {
      showToast(e?.message || "Couldn't post reply — try again");
    } finally {
      setPosting(false);
    }
  }

  async function clearReply() {
    if (!confirm("Remove your reply to this review?")) return;
    try {
      if (isProvider) {
        await providerService.replyToReview(r.id, "");
      } else {
        await businessService.replyToReview(r.id, "");
      }
      showToast("Reply removed");
      setReply("");
      setReplying(false);
      onReplied();
    } catch (e: any) {
      showToast(e?.message || "Couldn't remove reply");
    }
  }

  return (
    <div className="card">
      <div className="row gap-10">
        <SafeImg src={r.raterAvatar} variant="avatar" className="avatar" style={{ width: 38, height: 38 }} />
        <div className="grow">
          <div className="row between"><span className="semi small">{r.raterName}</span><span className="tiny muted">{r.date}</span></div>
          <StarRow value={r.rating} size={12} />
        </div>
      </div>
      <p className="small" style={{ marginTop: 8, lineHeight: 1.45 }}>{r.comment}</p>

      {r.ownerReply && !replying ? (
        <div className="card card-condensed" style={{ marginTop: 10, background: "var(--ink-50)", border: "none" }}>
          <div className="row between center-v">
            <div className="tiny semi" style={{ color: "var(--brand-700)" }}>Your reply</div>
            <div className="row gap-12 center-v">
              <button
                className="tiny semi row gap-4 center-v"
                style={{ color: "var(--brand-700)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                onClick={() => {
                  setReply(r.ownerReply || "");
                  setReplying(true);
                }}
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                className="tiny semi muted row gap-4 center-v"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                onClick={clearReply}
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
          <p className="small" style={{ marginTop: 4 }}>{r.ownerReply}</p>
        </div>
      ) : replying ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            className="input"
            placeholder="Reply publicly…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            style={{ minHeight: 60 }}
          />
          <div className="row gap-8" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost grow btn-sm" onClick={() => { setReply(r.ownerReply || ""); setReplying(false); }}>Cancel</button>
            <button className="btn btn-primary grow btn-sm" disabled={reply.trim().length < 2 || posting} onClick={postReply}>
              {posting ? "Posting…" : r.ownerReply ? "Update reply" : "Post reply"}
            </button>
          </div>
        </div>
      ) : (
        <div className="row gap-16" style={{ marginTop: 10 }}>
          <button className="row gap-6 tiny semi" style={{ color: "var(--brand-700)" }} onClick={() => setReplying(true)}>
            <Reply size={14} /> Reply
          </button>
          <button className="row gap-6 tiny semi muted" onClick={() => setReporting(true)}>
            <Flag size={14} /> Report
          </button>
        </div>
      )}

      {reporting && (
        <ReportSheet
          targetType="RATING"
          targetId={r.id}
          name={`${r.raterName}'s review`}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}
