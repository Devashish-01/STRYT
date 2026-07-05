import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { businessService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import type { QnaItem } from "@/types";

export default function QnaManager() {
  const { id = "" } = useParams();
  const { data, loading, error, refetch } = useQueryWithRealtime<QnaItem[]>(() => businessService.qna(id) as any, "business_qna", [id], `business_id=eq.${id}`);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Questions & Answers" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Questions & Answers" />
      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-12">
            {data.length === 0 && <EmptyState emoji="💬" title="No questions yet" text="Customer questions will appear here." />}
            {data.map((q) => <QaCard key={q.id} q={q} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function QaCard({ q }: { q: QnaItem }) {
  const { showToast } = useApp();
  const [answer, setAnswer] = useState(q.answer ?? "");
  const [answered, setAnswered] = useState(!!q.answer);
  const [editing, setEditing] = useState(false);

  async function save() {
    await businessService.answerQuestion(q.id, answer);
    setAnswered(true);
    setEditing(false);
    showToast("Answer posted");
  }

  return (
    <div className="card">
      <div className="row between">
        <span className="semi small">{q.askerName}</span>
        <span className="tiny muted">{q.askedAt}</span>
      </div>
      <p className="small" style={{ marginTop: 6 }}>{q.question}</p>
      {answered && !editing ? (
        <div className="card card-condensed" style={{ marginTop: 10, background: "var(--brand-50)", border: "none" }}>
          <div className="tiny semi" style={{ color: "var(--brand-700)", marginBottom: 2 }}>Your answer</div>
          <p className="small">{answer}</p>
          <button className="tiny semi" style={{ color: "var(--brand-700)", marginTop: 6 }} onClick={() => setEditing(true)}>Edit</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea className="input" placeholder="Type your answer…" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 64 }} />
          <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }} disabled={answer.trim().length < 2} onClick={save}>Post answer</button>
        </div>
      )}
    </div>
  );
}
