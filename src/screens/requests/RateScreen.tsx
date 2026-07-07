import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { Star } from "@/components/Icons";
import { requestService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { Skeleton } from "@/components/states";
import { useApp } from "@/store";

const quickTags = ["On time", "Great quality", "Polite", "Fair price", "Would recommend", "Quick response"];

export default function RateScreen() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: a, loading } = useQuery(() => requestService.getAgreement(id), [id]);
  const { showToast } = useApp();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [tip, setTip] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="screen">
        <AppBar title="Rate & review" />
        <div className="page-pad col center gap-12" style={{ paddingTop: 24 }}>
          <Skeleton h={80} w={80} r={40} />
          <Skeleton h={20} w="60%" />
        </div>
      </div>
    );
  }

  if (!a) {
    return (
      <div className="screen">
        <AppBar title="Rate" />
        <EmptyState emoji="⭐" title="Nothing to rate" text="Complete an agreement to leave a rating." />
      </div>
    );
  }

  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  async function submit() {
    if (rating === 0 || !a) return;
    setSubmitting(true);
    try {
      await requestService.rate(a.responderUserId, rating, [comment, ...tags].filter(Boolean).join(" • "), tip || undefined);
      showToast("Thanks! Your rating builds local trust.");
      setTimeout(() => nav("/agreements"), 700);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Rate & review" />
      <div className="screen-scroll page-pad col" style={{ paddingBottom: 90, alignItems: "center" }}>
        <SafeImg src={a.responderAvatar} variant="avatar" className="avatar" style={{ width: 80, height: 80, marginTop: 12 }} />
        <h2 className="bold h2" style={{ marginTop: 12 }}>How was {a.responderName}?</h2>
        <p className="small muted" style={{ textAlign: "center" }}>{a.requestTitle}</p>

        {/* Stars */}
        <div className="row gap-8" style={{ marginTop: 20 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} onClick={() => setRating(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}>
              <Star
                size={42}
                fill={i <= (hover || rating) ? "var(--amber-500)" : "none"}
                strokeWidth={i <= (hover || rating) ? 0 : 1.5}
                color={i <= (hover || rating) ? "var(--amber-500)" : "var(--ink-300)"}
                style={{ transition: "transform 0.1s", transform: i <= (hover || rating) ? "scale(1.08)" : "scale(1)" }}
              />
            </button>
          ))}
        </div>
        {rating > 0 && <div className="semi" style={{ marginTop: 10, color: "var(--amber-500)" }}>{labels[rating]}</div>}

        {/* Tags */}
        <div className="row wrap gap-8" style={{ marginTop: 22, justifyContent: "center" }}>
          {quickTags.map((t) => (
            <button
              key={t}
              className={`chip ${tags.includes(t) ? "active" : ""}`}
              onClick={() => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
            >
              {t}
            </button>
          ))}
        </div>

        <textarea
          className="input"
          style={{ marginTop: 18, width: "100%" }}
          placeholder="Share more about your experience (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {/* Tip (settled offline) */}
        <div className="card" style={{ marginTop: 16, width: "100%" }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="semi small">Add a tip? <span className="tiny muted">(paid in person)</span></span>
            {tip > 0 && <span className="bold" style={{ color: "var(--green-500)" }}>+₹{tip}</span>}
          </div>
          <div className="row gap-8">
            {[0, 20, 50, 100].map((t) => (
              <button key={t} className={`chip grow center ${tip === t ? "active" : ""}`} style={{ justifyContent: "center" }} onClick={() => setTip(t)}>
                {t === 0 ? "No tip" : `₹${t}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button
          className="btn btn-primary btn-block"
          disabled={rating === 0 || submitting}
          onClick={submit}
        >
          {submitting ? "Submitting…" : "Submit rating"}
        </button>
      </div>
    </div>
  );
}
