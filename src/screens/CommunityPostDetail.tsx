import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Heart, Send, CheckCircle2, MapPin, Phone, Flag, Pencil, Trash2, X, Camera } from "@/components/Icons";
import { communityService, businessService, providerService, socialService, uploadService } from "@/services";
import { useQueryWithRealtime, useQuery } from "@/hooks/useApi";
import { ListSkeleton } from "@/components/states";
import { SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import GuestSignInPrompt from "@/components/GuestSignInPrompt";
import ReportSheet from "@/components/ReportSheet";
import type { CommunityPost, Comment } from "@/types";
import { openProfile } from "@/lib/profileSheet";
import { resolveRecommendations, type ResolvedRecommendation } from "@/lib/communityRecommendations";
import { haptics } from "@/lib/haptics";

/** Author-only edit sheet — title/details/photo, the same fields CommunityCompose
 *  collects at creation time. Kept local to this file since it's only ever
 *  opened from here. */
function EditPostSheet({ post, onClose, onSaved }: { post: CommunityPost; onClose: () => void; onSaved: (p: CommunityPost) => void }) {
  const { showToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body ?? "");
  const [image, setImage] = useState<string | null | undefined>(post.image);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const canSave = title.trim().length > 3 && !saving && !uploading;

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      setImage(await uploadService.upload(file, "community"));
    } catch {
      showToast("Couldn't upload photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await communityService.update(post.id, { title: title.trim(), body: body.trim(), image });
      onSaved({ ...post, title: title.trim(), body: body.trim(), image: image ?? undefined });
      showToast("Post updated");
    } catch {
      showToast("Couldn't save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 className="bold h2" style={{ marginBottom: 14 }}>Edit post</h3>
        <div className="col gap-12">
          <div className="field">
            <label>Title *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>
          <div className="field">
            <label>Details</label>
            <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
          </div>
          <div className="field">
            <label>Photo</label>
            {image ? (
              <div style={{ position: "relative", width: 100 }}>
                <img src={image} className="thumb" style={{ width: 100, height: 100, borderRadius: 12, objectFit: "cover" }} />
                <button className="icon-btn" style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, background: "var(--red-500)", color: "#fff" }} onClick={() => setImage(null)}><X size={14} /></button>
              </div>
            ) : (
              <button
                className="col center"
                style={{ width: 100, height: 100, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 4, opacity: uploading ? 0.6 : 1 }}
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Camera size={20} /><span className="tiny">{uploading ? "…" : "Add photo"}</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!canSave} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function CommentRow({ c, nav, onReply, compact, canReply = true }: { c: Comment; nav: (to: string) => void; onReply: () => void; compact?: boolean; canReply?: boolean }) {
  const size = compact ? 30 : 36;
  return (
    <div className="row gap-10" style={{ alignItems: "flex-start" }}>
      <SafeImg src={c.authorAvatar} variant="avatar" className="avatar" style={{ width: size, height: size, flexShrink: 0 }} />
      <div className="grow">
        <div className="row between">
          <span className="semi small">{c.authorName}</span>
          <span className="tiny muted">{c.time}</span>
        </div>
        <p className="small" style={{ marginTop: 3, lineHeight: 1.45 }}>{c.body}</p>
        {c.sharedPhone && (
          <a
            href={`tel:${c.sharedPhone}`}
            className="tiny semi row gap-4"
            style={{ color: "var(--brand-700)", marginTop: 5, background: "var(--brand-50)", border: "1px solid var(--brand-100)", borderRadius: 8, padding: "4px 8px", width: "fit-content" }}
          >
            <Phone size={12} /> {c.sharedPhone}
            {c.phoneVisibility === "OWNER" && <span className="muted" style={{ fontWeight: 500 }}>· shared with you</span>}
          </a>
        )}
        {c.listingId && (
          <button
            className="tiny semi"
            style={{ color: "var(--brand-700)", marginTop: 4 }}
            onClick={() => nav(c.listingType === "BUSINESS" ? `/business/${c.listingId}` : `/provider/${c.listingId}`)}
          >
            → View listing
          </button>
        )}
        {canReply && <button className="tiny semi" style={{ color: "var(--ink-500)", marginTop: 4 }} onClick={onReply}>Reply</button>}
      </div>
    </div>
  );
}

export default function CommunityPostDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { state } = useLocation() as { state?: { post?: CommunityPost } };
  const { user, votes, votePoll, showToast, activeContext, isGuest } = useApp();

  const { data: activeBiz } = useQuery(
    () => activeContext.type === "business" && activeContext.id ? businessService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type],
    activeContext.type === "business" && activeContext.id ? `business:${activeContext.id}` : undefined
  );
  const { data: activeProv } = useQuery(
    () => activeContext.type === "provider" && activeContext.id ? providerService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type],
    activeContext.type === "provider" && activeContext.id ? `provider:${activeContext.id}` : undefined
  );

  // Use passed post for instant display; re-fetch in background for freshness.
  const { data: fetched } = useQueryWithRealtime(() => communityService.get(id, user.lat || undefined, user.lng || undefined), "community_posts", [id, user.lat, user.lng], `id=eq.${id}`);
  const post: CommunityPost | undefined = fetched ?? state?.post;

  // Whether the signed-in user and the post's author follow each other — gates
  // commenting alongside allow_comments (the author is always allowed). Runs
  // only when relevant; the server enforces the same rule via RLS.
  const authorUserId = post?.authorUserId;
  const { data: mutualFollow } = useQuery(
    () => (!isGuest && authorUserId && authorUserId !== user.id)
      ? socialService.isMutualFollow(authorUserId)
      : Promise.resolve(false),
    [authorUserId, user.id, isGuest]
  );

  const { data: initialComments, loading: commentsLoading } = useQueryWithRealtime(() => communityService.comments(id), "post_comments", [id], `post_id=eq.${id}`);

  // Looked up by id directly (not searched against a pre-fetched "nearby"
  // list) — a recommended listing isn't guaranteed to be within the current
  // viewer's own discovery radius. See src/lib/communityRecommendations.ts.
  const postRecs = post?.recommendations;
  const { data: recNames } = useQuery<Record<string, ResolvedRecommendation>>(
    () => (postRecs && postRecs.length > 0) ? resolveRecommendations(postRecs) : Promise.resolve({}),
    [id, postRecs?.map((r) => r.listingId).join(",")]
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [sharePhone, setSharePhone] = useState(false);
  const [phoneVis, setPhoneVis] = useState<"OWNER" | "PUBLIC">("OWNER");
  const [phoneInput, setPhoneInput] = useState("");
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolvedBusy, setResolvedBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Optimistic override for the like button, cleared once the server-confirmed
  // value (post.liked/post.likes) catches up — avoids XOR-ing against a value
  // that a realtime refetch can change out from under a session-wide toggle
  // (that was making the like visually revert; see GOAL_LIVE_AUDIT.md #8).
  const [likeOverride, setLikeOverride] = useState<boolean | null>(null);
  const [resolvedOverride, setResolvedOverride] = useState<boolean | null>(null);

  useEffect(() => { if (initialComments) setComments(initialComments); }, [initialComments]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comments]);
  useEffect(() => { setLikeOverride(null); }, [post?.liked, post?.likes]);
  useEffect(() => { setResolvedOverride(null); }, [post?.resolved]);

  if (!post) return (
    <div className="screen">
      <div className="appbar"><button className="icon-btn" onClick={() => nav(-1)}><ArrowLeft size={20} /></button></div>
      <ListSkeleton count={3} />
    </div>
  );

  // post is guaranteed non-undefined below this line.
  const safePost = post;
  // Comment gating: comments must be enabled AND the viewer is either the
  // author or a mutual follower. Drives whether the composer or a muted note
  // is shown (the post_comments RLS policy is the real enforcement).
  const allowComments = safePost.allowComments ?? false;
  const isAuthor = !isGuest && !!user.id && safePost.authorUserId === user.id;
  const canComment = allowComments && (isAuthor || !!mutualFollow);
  const liked = likeOverride ?? safePost.liked;
  const likeCount = Math.max(0, safePost.likes + (likeOverride === true && !safePost.liked ? 1 : 0) - (likeOverride === false && safePost.liked ? 1 : 0));
  const votedOption = votes[safePost.id] ?? safePost.votedOptionId;
  const totalVotes = (safePost.pollOptions?.reduce((s, o) => s + o.votes, 0) ?? 0) + (votedOption && !safePost.votedOptionId ? 1 : 0);
  const resolved = resolvedOverride ?? safePost.resolved ?? false;
  // "Resolved" only makes sense for these two types — a giveaway/poll/shoutout
  // never had an outstanding thing to resolve.
  const canMarkResolved = isAuthor && (safePost.type === "LOST_FOUND" || safePost.type === "ALERT");

  async function toggleResolved() {
    const next = !resolved;
    setResolvedOverride(next); // optimistic — this is a deliberate single tap, should feel instant
    setResolvedBusy(true);
    try {
      await communityService.setResolved(safePost.id, next);
    } catch {
      setResolvedOverride(!next);
      showToast("Couldn't update — try again");
    } finally {
      setResolvedBusy(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await communityService.delete(safePost.id);
      showToast("Post deleted");
      nav("/community-hub", { replace: true });
    } catch {
      showToast("Couldn't delete — try again");
      setDeleting(false);
    }
  }

  // Guests never reach these — every control that calls them is hidden below.
  async function handleLike() {
    const next = !liked;
    haptics.selection();
    setLikeOverride(next); // optimistic
    try {
      await communityService.like(safePost.id, liked);
    } catch {
      setLikeOverride(liked); // revert so the UI never lies
      showToast("Couldn't update like — try again");
    }
  }

  async function handleVote(optId: string) {
    if (votedOption) return;
    haptics.selection();
    votePoll(safePost.id, optId); // optimistic
    try {
      await communityService.vote(safePost.id, optId);
    } catch {
      showToast("Couldn't record your vote — try again");
    }
  }

  async function sendComment() {
    const text = newComment.trim();
    if (!text) return;
    setSending(true);
    setNewComment("");
    const phoneToShare = sharePhone ? (phoneInput.trim() || user.phone) : "";

    const customAuthor = activeContext.type === "business" && activeBiz ? {
      authorName: activeBiz.name,
      authorAvatar: activeBiz.coverImage
    } : activeContext.type === "provider" && activeProv ? {
      authorName: activeProv.displayName,
      authorAvatar: activeProv.avatar
    } : undefined;

    // A reply to a reply attaches to the same top-level comment, keeping threads
    // a clean two levels deep (Instagram-style).
    const parentId = replyingTo ? (replyingTo.parentId || replyingTo.id) : undefined;

    try {
      const c = await communityService.addComment(safePost.id, text, {
        sharedPhone: phoneToShare || undefined,
        phoneVisibility: phoneVis,
        parentId,
        ...customAuthor
      });
      haptics.selection();
      setComments((prev) => [...prev, c]);
      setSharePhone(false);
      setReplyingTo(null);
    } catch (e: any) {
      // addComment throws clear, user-facing reasons ("Comments are turned
      // off…" / "You both need to follow each other…") — surface them so the
      // toast is actionable instead of a generic failure.
      showToast(e?.message || "Couldn't send. Try again.");
      setNewComment(text);
    } finally {
      setSending(false);
    }
  }

  function startReply(c: Comment) {
    setReplyingTo(c);
    // Focus the composer.
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column" }}>
      <header className="appbar" style={{ borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <button className="icon-btn" onClick={() => nav(-1)}><ArrowLeft size={20} /></button>
        <span className="bold grow" style={{ fontSize: 16 }}>Post</span>
        {isAuthor && canMarkResolved && (
          <button
            className={`badge ${resolved ? "badge-green" : "badge-gray"}`}
            style={{ marginRight: 8 }}
            disabled={resolvedBusy}
            onClick={toggleResolved}
          >
            <CheckCircle2 size={11} /> {resolved ? "Resolved" : "Mark resolved"}
          </button>
        )}
        {!isAuthor && resolved && <span className="badge badge-green" style={{ marginRight: 8 }}><CheckCircle2 size={11} /> Resolved</span>}
        {isAuthor && (
          <>
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit post">
              <Pencil size={18} />
            </button>
            <button className="icon-btn" style={{ color: "var(--red-600)" }} onClick={() => setDeleteConfirm(true)} aria-label="Delete post">
              <Trash2 size={18} />
            </button>
          </>
        )}
        {!isGuest && !isAuthor && (
          <button className="icon-btn" onClick={() => setReporting(true)} aria-label="Report post">
            <Flag size={18} />
          </button>
        )}
      </header>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 72 }}>
        {/* Post body */}
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <div className="row gap-10" style={{ marginBottom: 10 }}>
            <SafeImg
              src={safePost.authorAvatar}
              variant={safePost.authorType === "business" ? "photo" : "avatar"}
              className="avatar"
              style={{
                width: 40, height: 40,
                border: safePost.authorType === "business" ? "2px solid var(--orange-500)" : safePost.authorType === "provider" ? "2px solid var(--green-500)" : "none",
                cursor: "pointer",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (safePost.authorType === "business" && safePost.authorRefId) {
                  openProfile(safePost.authorRefId, "BUSINESS", { name: safePost.authorName, avatar: safePost.authorAvatar });
                } else if (safePost.authorType === "provider" && safePost.authorRefId) {
                  openProfile(safePost.authorRefId, "PROVIDER", { name: safePost.authorName, avatar: safePost.authorAvatar });
                } else if (safePost.authorUserId) {
                  openProfile(safePost.authorUserId, "USER", { name: safePost.authorName, avatar: safePost.authorAvatar });
                }
              }}
            />
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
                    disabled={isGuest}
                    onClick={isGuest ? undefined : () => handleVote(o.id)}
                    style={{ position: "relative", textAlign: "left", padding: "11px 13px", borderRadius: "var(--radius-sm)", border: voted ? "1.5px solid var(--brand-500)" : "1.5px solid var(--ink-200)", overflow: "hidden", background: "#fff", cursor: isGuest ? "default" : "pointer", opacity: 1 }}
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
              {safePost.recommendations.map((rec) => {
                const resolved = recNames?.[rec.listingId];
                return (
                  <button
                    key={rec.listingId}
                    className="row gap-10"
                    style={{ padding: 10, borderRadius: 12, background: "var(--ink-50)", textAlign: "left" }}
                    onClick={() => nav(rec.listingType === "BUSINESS" ? `/business/${rec.listingId}` : `/provider/${rec.listingId}`)}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: rec.listingType === "BUSINESS" ? "var(--orange-100)" : "var(--green-100)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                      {rec.listingType === "BUSINESS" ? "🏪" : "👤"}
                    </div>
                    <div className="grow">
                      <div className="semi small">{resolved?.name ?? "Loading…"}</div>
                      <div className="tiny muted">Recommended by {rec.byName}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Like row — a guest sees the count as plain text, not a control. */}
          <div className="divider" style={{ margin: "14px 0" }} />
          {isGuest ? (
            <span className="row gap-6 small semi" style={{ color: "var(--ink-500)" }}>
              <Heart size={18} /> {likeCount} {likeCount === 1 ? "like" : "likes"}
            </span>
          ) : (
            <button className="row gap-6 small semi" style={{ color: liked ? "var(--red-500)" : "var(--ink-500)" }} onClick={handleLike}>
              <Heart size={18} fill={liked ? "var(--red-500)" : "none"} /> {likeCount} {likeCount === 1 ? "like" : "likes"}
            </button>
          )}
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
              {comments.filter((c) => !c.parentId).map((c) => {
                const replies = comments.filter((r) => r.parentId === c.id);
                return (
                  <div key={c.id} className="col gap-12 queue-row-enter">
                    <CommentRow c={c} nav={nav} onReply={() => startReply(c)} canReply={canComment} />
                    {replies.length > 0 && (
                      <div className="col gap-12" style={{ marginLeft: 46, paddingLeft: 10, borderLeft: "2px solid var(--line)" }}>
                        {replies.map((r) => (
                          <CommentRow key={r.id} c={r} nav={nav} onReply={() => startReply(r)} compact canReply={canComment} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {comments.length === 0 && (
                <p className="small muted center" style={{ padding: "20px 0" }}>No comments yet. Be the first!</p>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Comment input — a guest reads the whole thread but gets the sign-in
          prompt where the composer would be, rather than an input that can't
          submit (and a "share my number" control they have no number for). */}
      {isGuest ? (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "10px 12px max(10px, var(--safe-area-bottom))" }}>
          <GuestSignInPrompt message="Sign in to join the conversation" compact />
        </div>
      ) : !allowComments ? (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "14px 12px max(14px, var(--safe-area-bottom))" }}>
          <p className="small muted center" style={{ margin: 0 }}>Comments are turned off for this post.</p>
        </div>
      ) : !canComment ? (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "14px 12px max(14px, var(--safe-area-bottom))" }}>
          <p className="small muted center" style={{ margin: 0 }}>Follow each other to comment</p>
        </div>
      ) : (
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "10px 12px max(10px, var(--safe-area-bottom))" }}>
        {replyingTo && (
          <div className="row between center-v" style={{ marginBottom: "var(--space-xs)", padding: "6px 10px", background: "var(--brand-50)", borderRadius: 10 }}>
            <span className="tiny" style={{ color: "var(--brand-700)" }}>Replying to <span className="semi">{replyingTo.authorName}</span></span>
            <button className="tiny semi" style={{ color: "var(--ink-500)" }} onClick={() => setReplyingTo(null)}>Cancel</button>
          </div>
        )}
        {/* #8 share-phone controls */}
        <div className="col gap-8" style={{ marginBottom: 8 }}>
          <div className="row gap-8" style={{ flexWrap: "wrap" }}>
            <button
              className="chip"
              style={{ padding: "5px 11px", fontSize: 12, gap: 5, ...(sharePhone ? { background: "var(--brand-600)", borderColor: "var(--brand-600)", color: "#fff" } : {}) }}
              onClick={() => {
                setSharePhone((v) => {
                  const next = !v;
                  if (next && !phoneInput) setPhoneInput(user.phone || "");
                  return next;
                });
              }}
            >
              <Phone size={13} /> {sharePhone ? "Sharing my number" : "Share my number"}
            </button>
            {sharePhone && (
              <>
                <button className={`chip ${phoneVis === "OWNER" ? "active" : ""}`} style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => setPhoneVis("OWNER")}>
                  Post owner only
                </button>
                <button className={`chip ${phoneVis === "PUBLIC" ? "active" : ""}`} style={{ padding: "5px 11px", fontSize: 12 }} onClick={() => setPhoneVis("PUBLIC")}>
                  Everyone
                </button>
              </>
            )}
          </div>
          {sharePhone && (
            <div className="row gap-8" style={{ border: "1.5px solid var(--ink-200)", borderRadius: "var(--radius-sm)", padding: "0 10px", background: "#fff" }}>
              <Phone size={14} color="var(--ink-400)" />
              <input
                className="input"
                style={{ border: "none", padding: "9px 0", fontSize: 14 }}
                inputMode="numeric"
                maxLength={10}
                placeholder="Number to share (10 digits)"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
        </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <SafeImg
          src={
            (activeContext.type === "business" && activeBiz?.coverImage) || 
            (activeContext.type === "provider" && activeProv?.avatar) || 
            user.avatar
          }
          variant={activeContext.type === "provider" ? "avatar" : "photo"}
          className="avatar"
          style={{ width: 32, height: 32, flexShrink: 0 }}
        />
        <textarea
          className="input"
          placeholder={replyingTo ? "Write a reply…" : "Add a comment…"}
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
      )}

      {reporting && (
        <ReportSheet targetType="POST" targetId={safePost.id} name={safePost.title || "this post"} onClose={() => setReporting(false)} />
      )}

      {editing && (
        <EditPostSheet
          post={safePost}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}

      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h2 className="h2" style={{ marginBottom: 6 }}>Delete this post?</h2>
            <p className="small muted" style={{ marginBottom: "var(--space-md)", lineHeight: 1.5 }}>
              This removes it and its comments for everyone. This can't be undone.
            </p>
            <div className="col gap-8">
              <button
                className="btn btn-block"
                style={{ background: "var(--red-500)", color: "#fff" }}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setDeleteConfirm(false)}>Keep post</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
