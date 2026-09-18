import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppBar, EmptyState } from "@/components/common";
import { businessService } from "@/services";
import ManageNav from "./ManageNav";
import ReportSheet from "@/components/ReportSheet";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { useApp } from "@/store";
import type { QnaItem } from "@/types";
import { errorMessage } from "@/lib/errorMessage";

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
    <div className="screen with-nav">
      <AppBar title="Questions & Answers" />
      <div className="screen-scroll">
        {loading && <ListSkeleton count={3} />}
        {error && <ErrorView error={error} onRetry={refetch} />}
        {data && (
          <div className="page-pad col gap-12">
            {data.length === 0 && <EmptyState emoji="💬" title="No questions yet" text="Customer questions will appear here." />}
            {[...data].sort((a, b) => {
              if (!!a.answer !== !!b.answer) return a.answer ? 1 : -1;
              return b.upvotes - a.upvotes;
            }).map((q) => <QaCard key={q.id} q={q} onChanged={refetch} />)}
          </div>
        )}
      </div>
      {/* QNA-2: the console nav was missing here, so answering a question was a dead end. */}
      <ManageNav bizId={id} />
    </div>
  );
}

function QaCard({ q, onChanged }: { q: QnaItem; onChanged: () => void }) {
  const { showToast } = useApp();
  const [answer, setAnswer] = useState(q.answer ?? "");
  const [answered, setAnswered] = useState(!!q.answer);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await businessService.answerQuestion(q.id, answer.trim());
      setAnswered(true);
      setEditing(false);
      showToast("Answer posted");
      onChanged();
    } catch (e) {
      showToast(errorMessage(e, "Couldn't post — try again"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <span className="semi small">{q.askerName}</span>
        <span className="row gap-8 align-center">
          {q.upvotes > 0 && (
            <span className="tiny semi row gap-4" style={{ color: "var(--brand-700)", alignItems: "center" }}>
              👍 {q.upvotes}
            </span>
          )}
          <span className="tiny muted">{q.askedAt}</span>
        </span>
      </div>
      <p className="small" style={{ marginTop: 6 }}>{q.question}</p>
      {answered && !editing ? (
        <div className="card card-condensed" style={{ marginTop: 10, background: "var(--brand-50)", border: "none" }}>
          <div className="tiny semi" style={{ color: "var(--brand-700)", marginBottom: 2 }}>Your answer</div>
          <p className="small">{answer}</p>
          <button className="tiny semi" style={{ color: "var(--brand-700)", marginTop: 6, minHeight: 44, background: "none", border: "none" }} onClick={() => setEditing(true)}>Edit</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {/* QNA-6: an answer is public text on the storefront — bounded, and saved trimmed. */}
          <textarea
            className="input"
            placeholder="Type your answer…"
            value={answer}
            maxLength={1000}
            onChange={(e) => setAnswer(e.target.value)}
            style={{ minHeight: 64 }}
          />
          <div className="row gap-8" style={{ marginTop: 8 }}>
            {editing && (
              // QNA-5: editing an answer had no way out but saving it.
              <button className="btn btn-outline btn-sm grow" onClick={() => { setAnswer(q.answer ?? ""); setEditing(false); }}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary btn-sm grow" disabled={answer.trim().length < 2 || saving} onClick={save}>
              {saving ? "Posting…" : "Post answer"}
            </button>
          </div>
        </div>
      )}
      {/* QNA-4: a spam or abusive question had no route to moderation from the console. */}
      <button
        className="tiny muted"
        style={{ marginTop: 10, background: "none", border: "none", padding: "6px 0", minHeight: 44, cursor: "pointer" }}
        onClick={() => setReporting(true)}
      >
        Report this question
      </button>
      {reporting && (
        <ReportSheet
          targetType="QUESTION"
          targetId={q.id}
          name={q.question.slice(0, 60) || "this question"}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}
