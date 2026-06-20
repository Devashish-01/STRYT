import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Heart, Send, CheckCircle2, MapPin } from "lucide-react";
import { communityService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import type { CommunityPost, Comment } from "@/types";

export default function CommunityPostDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { post?: CommunityPost } };
  const { user, likes, toggleLike, votes, votePoll, showToast } = useApp();

  // Use passed post for instant display; re-fetch in background for freshness.
  const { data: fetched } = useQuery(() => communityService.get(id), [id]);
  const post: CommunityPost | undefined = fetched ?? state?.post;

  const { data: initialComments, loading: commentsLoading } = useQuery(() => communityService.comments(id), [id]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (initialComments) setComments(initialComments); }, [initialComments]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comments]);

  if (!post) return (
    <div className="screen">
      <div className="appbar"><button className="icon-btn" onClick={() => nav(-1)}><ArrowLeft size={20} /></button></div>
      <ListSkeleton count={3} />
    </div>
  );

  // post is guaranteed non-undefined below this line.
  const safePost = post;
  // XOR: the store tracks session-toggles only (empty on load); DB truth is safePost.liked.
  const toggled = likes.includes(safePost.id);
  const liked = toggled ? !safePost.liked : safePost.liked;
  const likeCount = safePost.likes + (liked && !safePost.liked ? 1 : 0) - (!liked && safePost.liked ? 1 : 0);
  const votedOption = votes[safePost.id] ?? safePost.votedOptionId;
  const totalVotes = (safePost.pollOptions?.reduce((s, o) => s + o.votes, 0) ?? 0) + (votedOption && !safePost.votedOptionId ? 1 : 0);

  async function handleLike() {
    toggleLike(safePost.id);
    await communityService.like(safePost.id, liked);
  }

  async function handleVote(optId: string) {
    if (votedOption) return;
    votePoll(safePost.id, optId);
    await communityService.vote(safePost.id, optId);
  }

  async function sendComment() {
    const text = newComment.trim();
    if (!text) return;
    setSending(true);
    setNewComment("");
    try {
      const c = await communityService.addComment(safePost.id, text);
      setComments((prev) => [...prev, c]);
    } catch {
      showToast("Couldn't send. Try again.");
      setNewComment(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column" }}>
      <header className="appbar" style={{ borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <button className="icon-btn" onClick={() => nav(-1)}><ArrowLeft size={20} /></button>
        <span className="bold grow" style={{ fontSize: 16 }}>Post</span>
        {safePost.resolved && <span className="badge badge-green"><CheckCircle2 size={11} /> Resolved</span>}
      </header>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 72 }}>
        {/* Post body */}
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <div className="row gap-10" style={{ marginBottom: 10 }}>
            <SafeImg src={safePost.authorAvatar} variant="avatar" className="avatar" style={{ width: 40, height: 40 }} />
            <div className="grow">
              <div className="semi small">{safePost.authorName}</div>
              <span className="tiny muted row gap-4"><MapPin size={11} />{safePost.area} • {safePost.postedAt}</span>
            </div>
          </div>
          <div className="bold" style={{ fontSize: 18 }}>{safePost.title}</div>
          <p className="small" style={{ marginTop: 6, lineHeight: 1.55, color: "var(--ink-700)" }}>{safePost.body}</p>
          {safePost.image && <SafeImg src={safePost.image} style={{ width: "100%", height: 200, borderRadius: 14, marginTop: 10, objectFit: "cover" }} />}

          {/* Poll */}
          {safePost.type === "POLL" && safePost.pollOptions && (
            <div className="col gap-8" style={{ marginTop: 14 }}>
              {safePost.pollOptions.map((o) => {
                const voted = votedOption === o.id;
                const v = o.votes + (voted && !safePost.votedOptionId ? 1 : 0);
                const pct = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
                return (
                  <button
                    key={o.id}
                    onClick={() => handleVote(o.id)}
                    style={{ position: "relative", textAlign: "left", padding: "11px 13px", borderRadius: 10, border: voted ? "1.5px solid var(--brand-500)" : "1.5px solid var(--ink-200)", overflow: "hidden", background: "#fff" }}
                  >
                    {votedOption && <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: voted ? "var(--brand-100)" : "var(--ink-100)" }} />}
                    <div className="row between" style={{ position: "relative" }}>
                      <span className="small semi">{o.label}</span>
                      {votedOption && <span className="small semi" style={{ color: "var(--brand-700)" }}>{pct}%</span>}
                    </div>
                  </button>
                );
              })}
              <span className="tiny muted">{totalVotes} votes</span>
            </div>
          )}

          {/* Recommendations */}
          {safePost.recommendations && safePost.recommendations.length > 0 && (
            <div className="col gap-8" style={{ marginTop: 12 }}>
              {safePost.recommendations.map((rec, i) => (
                <button
                  key={i}
                  className="row gap-10"
                  style={{ padding: 10, borderRadius: 12, background: "var(--ink-50)", textAlign: "left" }}
                  onClick={() => nav(rec.listingType === "BUSINESS" ? `/business/${rec.listingId}` : `/provider/${rec.listingId}`)}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: rec.listingType === "BUSINESS" ? "#ffedd5" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {rec.listingType === "BUSINESS" ? "🏪" : "👤"}
                  </div>
                  <div className="grow">
                    <div className="semi small">{rec.listingId}</div>
                    <div className="tiny muted">Recommended by {rec.byName}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Like row */}
          <div className="divider" style={{ margin: "14px 0" }} />
          <button className="row gap-6 small semi" style={{ color: liked ? "#ef4444" : "var(--ink-500)" }} onClick={handleLike}>
            <Heart size={18} fill={liked ? "#ef4444" : "none"} /> {likeCount} {likeCount === 1 ? "like" : "likes"}
          </button>
        </div>

        <div className="divider" style={{ margin: "14px 0", borderWidth: 4 }} />

        {/* Comments */}
        <div className="page-pad">
          <div className="semi small muted" style={{ marginBottom: 12 }}>
            {comments.length} comment{comments.length !== 1 ? "s" : ""}
          </div>
          {commentsLoading ? (
            <ListSkeleton count={2} />
          ) : (
            <div className="col gap-16">
              {comments.map((c) => (
                <div key={c.id} className="row gap-10" style={{ alignItems: "flex-start" }}>
                  <SafeImg src={c.authorAvatar} variant="avatar" className="avatar" style={{ width: 36, height: 36, flexShrink: 0 }} />
                  <div className="grow">
                    <div className="row between">
                      <span className="semi small">{c.authorName}</span>
                      <span className="tiny muted">{c.time}</span>
                    </div>
                    <p className="small" style={{ marginTop: 3, lineHeight: 1.45 }}>{c.body}</p>
                    {c.listingId && (
                      <button
                        className="tiny semi"
                        style={{ color: "var(--brand-700)", marginTop: 4 }}
                        onClick={() => nav(c.listingType === "BUSINESS" ? `/business/${c.listingId}` : `/provider/${c.listingId}`)}
                      >
                        → View listing
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="small muted center" style={{ padding: "20px 0" }}>No comments yet. Be the first!</p>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Comment input */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-end" }}>
        <SafeImg src={user.avatar} variant="avatar" className="avatar" style={{ width: 32, height: 32, flexShrink: 0 }} />
        <textarea
          className="input"
          placeholder="Add a comment…"
          value={newComment}
          rows={1}
          style={{ flex: 1, resize: "none", maxHeight: 80, overflowY: "auto", padding: "8px 12px", borderRadius: 20, lineHeight: 1.4, fontSize: 14 }}
          onChange={(e) => {
            setNewComment(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
          disabled={sending}
        />
        <button
          onClick={sendComment}
          disabled={!newComment.trim() || sending}
          style={{ width: 38, height: 38, borderRadius: "50%", background: newComment.trim() ? "var(--brand-600)" : "var(--ink-200)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "none", flexShrink: 0, cursor: newComment.trim() ? "pointer" : "default" }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
