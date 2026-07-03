import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, StarRow, SafeImg } from "@/components/common";
import { businessService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import { Flag, Reply } from "lucide-react";
import type { Review } from "@/types";

export default function ReviewsManager() {
  const { id = "" } = useParams();
  const [filter, setFilter] = useState<number | null>(null);
  const { data, loading, error, refetch } = useQueryWithRealtime(() => businessService.reviews(id), "ratings", [id], `ratee_id=eq.${id}`);

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
    <div className="screen">
      <AppBar title="Reviews" subtitle={`${avg}★ • ${reviews.length} reviews`} />
      <div className="screen-scroll">
        <div className="hscroll" style={{ paddingTop: 12 }}>
          <button className={`chip ${filter === null ? "active" : ""}`} onClick={() => setFilter(null)}>All</button>
          {[5, 4, 3, 2, 1].map((s) => (
            <button key={s} className={`chip ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>{s} ★</button>
          ))}
        </div>
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {!loading && !error && (
          <div className="page-pad col gap-14">
            {list.map((r) => <ReviewItem key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewItem({ r }: { r: Review }) {
  const { showToast } = useApp();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [replied, setReplied] = useState(false);

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row gap-10">
        <SafeImg src={r.raterAvatar} variant="avatar" className="avatar" style={{ width: 38, height: 38 }} />
        <div className="grow">
          <div className="row between"><span className="semi small">{r.raterName}</span><span className="tiny muted">{r.date}</span></div>
          <StarRow value={r.rating} size={12} />
        </div>
      </div>
      <p className="small" style={{ marginTop: 8, lineHeight: 1.45 }}>{r.comment}</p>

      {replied ? (
        <div className="card" style={{ padding: 10, marginTop: 10, background: "var(--ink-50)", border: "none" }}>
          <div className="tiny semi" style={{ color: "var(--brand-700)" }}>Owner reply</div>
          <p className="small" style={{ marginTop: 2 }}>{reply}</p>
        </div>
      ) : replying ? (
        <div style={{ marginTop: 10 }}>
          <textarea className="input" placeholder="Reply publicly…" value={reply} onChange={(e) => setReply(e.target.value)} style={{ minHeight: 60 }} />
          <div className="row gap-8" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost grow btn-sm" onClick={() => setReplying(false)}>Cancel</button>
            <button className="btn btn-primary grow btn-sm" disabled={reply.trim().length < 2} onClick={() => { setReplied(true); setReplying(false); showToast("Reply posted"); }}>Post reply</button>
          </div>
        </div>
      ) : (
        <div className="row gap-16" style={{ marginTop: 10 }}>
          <button className="row gap-6 tiny semi" style={{ color: "var(--brand-700)" }} onClick={() => setReplying(true)}><Reply size={14} /> Reply</button>
          <button className="row gap-6 tiny semi muted" onClick={() => showToast("Reported to moderation")}><Flag size={14} /> Report</button>
        </div>
      )}
    </div>
  );
}
