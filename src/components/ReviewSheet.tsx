import { useState } from "react";
import { Star } from "lucide-react";
import { useApp } from "@/store";

interface Props {
  targetName: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onClose: () => void;
}

const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export default function ReviewSheet({ targetName, onSubmit, onClose }: Props) {
  const { showToast } = useApp();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(rating, comment);
      showToast("Review submitted! Thank you.");
      onClose();
    } catch {
      showToast("Couldn't submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 24 }}>
        <div className="sheet-grab" />
        <div className="bold" style={{ fontSize: 18, marginBottom: 4 }}>Write a review</div>
        <div className="small muted" style={{ marginBottom: 20 }}>{targetName}</div>

        {/* Star picker */}
        <div className="row center gap-10" style={{ marginBottom: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              onClick={() => setRating(i)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(0)}
            >
              <Star
                size={40}
                fill={i <= (hover || rating) ? "#f59e0b" : "none"}
                strokeWidth={i <= (hover || rating) ? 0 : 1.5}
                color={i <= (hover || rating) ? "#f59e0b" : "var(--ink-300)"}
                style={{ transition: "transform 0.1s", transform: i <= (hover || rating) ? "scale(1.1)" : "scale(1)" }}
              />
            </button>
          ))}
        </div>
        {rating > 0 && (
          <div className="semi center" style={{ color: "#f59e0b", marginBottom: 16 }}>{labels[rating]}</div>
        )}

        <textarea
          className="input"
          placeholder="Share your experience (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          style={{ minHeight: 90, marginBottom: 16 }}
        />

        <button
          className="btn btn-primary btn-block"
          disabled={rating === 0 || submitting}
          onClick={submit}
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
      </div>
    </div>
  );
}
