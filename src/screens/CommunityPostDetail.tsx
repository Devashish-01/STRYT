import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Heart, Send, CheckCircle2, MapPin, Phone, Flag, Pencil, Trash2, X, Camera, Clock, ChevronRight, Bookmark, Share2 } from "@/components/Icons";
import { communityService, businessService, providerService, socialService, uploadService } from "@/services";
import ShareCard from "@/components/ShareCard";
import { useQueryWithRealtime, useQuery } from "@/hooks/useApi";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabaseClient";
import { ListSkeleton } from "@/components/states";
import { SafeImg, inr } from "@/components/common";
import { useApp } from "@/store";
import GuestSignInPrompt from "@/components/GuestSignInPrompt";
import ReportSheet from "@/components/ReportSheet";
import type { CommunityPost, Comment } from "@/types";
import { openProfile } from "@/lib/profileSheet";
import { resolveRecommendations, type ResolvedRecommendation } from "@/lib/communityRecommendations";
import { haptics } from "@/lib/haptics";
import { COMMUNITY_TYPE_META, MAX_POST_MEDIA, MIN_TITLE_LEN } from "@/lib/communityTypes";
import {
  SEVERITY_TONE,
  addMedia,
  canAddMedia,
  isPollClosed,
  postMedia,
  removeMediaAt,
  severityMeta,
  timeLeftLabel,
} from "@/lib/communityPost";
import {
  gateCopy,
  localGate,
  policyBadge,
  resolveCommentPolicy,
  type CommentGateReason,
} from "@/lib/commentPolicy";
import {
  COMMENT_REACTIONS,
  applyMention,
  mentionQueryAt,
  parseBody,
  sortComments,
  type CommentSort,
  type MentionQuery,
} from "@/lib/mentions";
import { postShareSubtitle, postShareUrl } from "@/lib/postInteractions";

/** Author-only edit sheet — title/details/photo, the same fields CommunityCompose
 *  collects at creation time. Kept local to this file since it's only ever
 *  opened from here. */
function EditPostSheet({ post, onClose, onSaved }: { post: CommunityPost; onClose: () => void; onSaved: (p: CommunityPost) => void }) {
  const { showToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body ?? "");
  // Edits the whole photo list, not just the cover. Editing only `image` while
  // the card reads `media` would leave the two disagreeing about what the post
  // shows — postMedia() seeds this from whichever the row actually has.
  const [media, setMedia] = useState<string[]>(postMedia(post));
  const [imageAlt, setImageAlt] = useState(post.imageAlt ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const canSave = title.trim().length >= MIN_TITLE_LEN && !saving && !uploading;

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!canAddMedia(media)) {
      showToast(`Up to ${MAX_POST_MEDIA} photos per post`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadService.upload(file, "community");
      const res = addMedia(media, url);
      if (res.rejected === "AT_LIMIT") showToast(`Up to ${MAX_POST_MEDIA} photos per post`);
      else setMedia(res.media);
    } catch {
      showToast("Couldn't upload photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const alt = imageAlt.trim();
      await communityService.update(post.id, {
        title: title.trim(),
        body: body.trim(),
        media,
        imageAlt: media.length > 0 ? alt : null,
      });
      onSaved({
        ...post,
        title: title.trim(),
        body: body.trim(),
        media,
        image: media[0],
        imageAlt: media.length > 0 && alt ? alt : undefined,
      });
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
            <label className="row between">
              <span>Photos</span>
              <span className="tiny muted tabular-nums">{media.length}/{MAX_POST_MEDIA}</span>
            </label>
            <div className="media-strip">
              {media.map((url, i) => (
                <div key={url} className={`media-thumb ${i === 0 ? "media-thumb-cover" : ""}`}>
                  <img src={url} alt={i === 0 ? "Cover photo" : `Photo ${i + 1}`} />
                  {i === 0 && media.length > 1 && <span className="media-cover-tag">COVER</span>}
                  <button
                    type="button"
                    className="media-thumb-x"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setMedia(removeMediaAt(media, i))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {canAddMedia(media) && (
                <button type="button" className="media-add" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Camera size={20} /><span>{uploading ? "Uploading…" : "Add"}</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
            {media.length > 0 && (
              <input
                className="input"
                style={{ marginTop: 9 }}
                placeholder="Describe the photo (for screen readers)"
                aria-label="Photo description for screen readers"
                value={imageAlt}
                maxLength={200}
                onChange={(e) => setImageAlt(e.target.value)}
              />
            )}
          </div>
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!canSave} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/** A comment body with its @mentions rendered as taps through to the profile.
 *  Unresolved mentions stay plain text — see parseBody. */
function CommentBody({ body, mentions }: { body: string; mentions?: { userId: string; alias: string }[] }) {
  const segments = parseBody(body, mentions ?? []);
  return (
    <p className="small" style={{ marginTop: 4, lineHeight: 1.5, color: "var(--ink-800)", fontSize: 13.5, whiteSpace: "pre-wrap" }}>
      {segments.map((seg, i) =>
        seg.kind === "mention" && seg.userId ? (
          <button
            key={i}
            className="semi"
            style={{ color: "var(--brand-700)", background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 600, cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              openProfile(seg.userId!, "USER", { name: seg.alias });
            }}
          >
            {seg.text}
          </button>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  );
}

function CommentRow({ c, nav, onReply, compact, canReply = true, onReact, canReact = true }: {
  c: Comment;
  nav: (to: string) => void;
  onReply: () => void;
  compact?: boolean;
  canReply?: boolean;
  onReact?: (emoji: string | null) => void;
  canReact?: boolean;
}) {
  const size = compact ? 32 : 38;
  const [pickerOpen, setPickerOpen] = useState(false);
  const tallies = Object.entries(c.reactions ?? {}).filter(([, n]) => n > 0);
  return (
    <div className="row gap-10" style={{ alignItems: "flex-start" }}>
      <SafeImg src={c.authorAvatar} variant="avatar" className="avatar" style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", border: "1px solid var(--ink-200)" }} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ background: "var(--ink-50)", padding: "10px 14px", borderRadius: 16, border: "1px solid rgba(226, 225, 240, 0.7)" }}>
          <div className="row between gap-6 center-v">
            <span className="semi small" style={{ color: "var(--ink-900)", fontSize: 13.5, fontWeight: 600 }}>{c.authorName}</span>
            <span className="tiny muted" style={{ fontSize: 11.5 }}>{c.time}</span>
          </div>
          <CommentBody body={c.body} mentions={c.mentions} />
          {c.sharedPhone && (
            <a
              href={`tel:${c.sharedPhone}`}
              className="tiny semi row gap-4 center-v"
              style={{ color: "var(--brand-700)", marginTop: 6, background: "var(--brand-50)", border: "1px solid var(--brand-100)", borderRadius: 10, padding: "4px 9px", width: "fit-content" }}
            >
              <Phone size={12} /> {c.sharedPhone}
              {c.phoneVisibility === "OWNER" && <span className="muted" style={{ fontWeight: 500 }}>· shared with you</span>}
            </a>
          )}
          {c.listingId && (
            <button
              className="tiny semi"
              style={{ color: "var(--brand-700)", marginTop: 6, display: "block", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => nav(c.listingType === "BUSINESS" ? `/business/${c.listingId}` : `/provider/${c.listingId}`)}
            >
              → View listing
            </button>
          )}
        </div>
        {/* Reaction tallies + the row's own actions. A reaction is the cheap
            acknowledgement that stops "thanks, this helped" from becoming a
            full reply and burying the useful answer. */}
        <div className="row gap-6 center-v wrap" style={{ marginTop: 5, marginLeft: 6 }}>
          {tallies.map(([emoji, n]) => {
            const isMine = c.myReaction === emoji;
            return (
              <button
                key={emoji}
                className="tiny semi row gap-3 center-v"
                style={{
                  fontSize: 11.5, padding: "2px 8px", borderRadius: 999, cursor: canReact ? "pointer" : "default",
                  background: isMine ? "var(--brand-50)" : "var(--ink-100)",
                  border: `1px solid ${isMine ? "var(--brand-200)" : "var(--ink-200)"}`,
                  color: isMine ? "var(--brand-800)" : "var(--ink-700)",
                }}
                disabled={!canReact}
                aria-pressed={isMine}
                aria-label={`${emoji} ${n}${isMine ? ", your reaction" : ""}`}
                onClick={() => onReact?.(isMine ? null : emoji)}
              >
                <span aria-hidden="true">{emoji}</span> {n}
              </button>
            );
          })}
          {canReact && (
            <button
              className="tiny semi"
              style={{ color: "var(--ink-500)", padding: "2px 7px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5 }}
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              aria-label="Add a reaction"
            >
              {tallies.length > 0 ? "＋" : "＋ React"}
            </button>
          )}
          {canReply && (
            <button className="tiny semi" style={{ color: "var(--brand-700)", padding: "2px 6px", background: "none", border: "none", cursor: "pointer" }} onClick={onReply}>
              Reply
            </button>
          )}
        </div>

        {pickerOpen && canReact && (
          <div className="row gap-4 center-v" style={{ marginTop: 5, marginLeft: 6, padding: "5px 8px", background: "var(--surface)", border: "1px solid var(--ink-200)", borderRadius: 999, width: "fit-content", boxShadow: "var(--shadow-sm)" }}>
            {COMMENT_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: "1px 3px", lineHeight: 1 }}
                aria-label={`React with ${emoji}`}
                onClick={() => {
                  setPickerOpen(false);
                  onReact?.(c.myReaction === emoji ? null : emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
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

  // Whether this viewer may comment, and if not, why. Asked of the same
  // function the RLS policy uses (comment_gate_reason -> can_comment_on_post),
  // which replaced a client-side re-implementation of "comments on + mutual
  // follow": that version couldn't see the post's chosen policy, distance,
  // blocks, or the rate limit, so the composer could appear on a thread the
  // server would reject.
  const authorUserId = post?.authorUserId;
  const { data: gateReason } = useQuery<CommentGateReason>(
    () => (isGuest || !post) ? Promise.resolve("SIGN_IN" as CommentGateReason) : communityService.commentGate(id),
    [id, isGuest, !!post, authorUserId]
  );

  const { data: initialComments, loading: commentsLoading, refetch: refetchComments } = useQueryWithRealtime(() => communityService.comments(id), "post_comments", [id], `post_id=eq.${id}`);

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
  const [commentSort, setCommentSort] = useState<CommentSort>("top");
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [sharing, setSharing] = useState(false);
  const [saveOverride, setSaveOverride] = useState<boolean | null>(null);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Only queried while a mention is actually being typed.
  const mentionTerm = mentionQuery?.term ?? null;
  const { data: mentionResults } = useQuery<{ id: string; name: string; avatar: string }[]>(
    () => (mentionTerm !== null && !isGuest)
      ? socialService.searchNeighbors(mentionTerm)
      : Promise.resolve([]),
    [mentionTerm, isGuest]
  );

  function pickMention(alias: string) {
    if (!mentionQuery) return;
    const { body, caret } = applyMention(newComment, mentionQuery, alias);
    setNewComment(body);
    setMentionQuery(null);
    // Put the caret back where the typing left off, not at the end of the box.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  }

  useEffect(() => { if (initialComments) setComments(initialComments); }, [initialComments]);

  // comment_reactions (20260895) has no post_id column, so it can't be scoped
  // with a `filter` the way post_comments is above — subscribe unfiltered and
  // only refetch when the changed row is actually one of this thread's
  // comments. Without this, another viewer's reaction never shows up here
  // until something else (a new comment) happens to trigger a refetch.
  const commentIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { commentIdsRef.current = new Set(comments.map((c) => c.id)); }, [comments]);
  // refetch's identity isn't stable across renders (useQuery returns a fresh
  // closure each time) — read it via a ref so the channel below isn't torn
  // down and rebuilt on every render, only when the post actually changes.
  const refetchCommentsRef = useRef(refetchComments);
  refetchCommentsRef.current = refetchComments;
  useEffect(() => {
    if (!hasSupabaseEnv) return;
    const sb = getSupabase();
    const channel = sb
      .channel(`rt:comment_reactions:${id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "comment_reactions" },
        (payload: any) => {
          const commentId = payload?.new?.comment_id ?? payload?.old?.comment_id;
          if (commentId && commentIdsRef.current.has(commentId)) refetchCommentsRef.current();
        }
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[realtime] "comment_reactions" subscription ${status} — check the supabase_realtime publication for this table.`);
        }
      });
    return () => { sb.removeChannel(channel); };
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comments]);
  useEffect(() => {
    if (likeOverride === null) return;
    if (post?.liked === likeOverride) setLikeOverride(null);
  }, [post?.liked, post?.likes, likeOverride]);
  useEffect(() => { setResolvedOverride(null); }, [post?.resolved]);

  if (!post) return (
    <div className="screen">
      <div className="appbar"><button className="icon-btn" onClick={() => nav(-1)} aria-label="Go back"><ArrowLeft size={20} /></button></div>
      <ListSkeleton count={3} />
    </div>
  );

  // post is guaranteed non-undefined below this line.
  const safePost = post;
  const isAuthor = !isGuest && !!user.id && safePost.authorUserId === user.id;
  // The author's chosen policy drives the header badge; the gate (which also
  // accounts for distance, blocks and rate limiting) drives the composer.
  // Until the gate resolves, EVERYONE/OFF can be predicted with confidence —
  // neither depends on distance or mutual-follow, so the server can't disagree.
  // NEIGHBORS/MUTUALS genuinely can't: this screen has no synchronous signal
  // for "is this viewer a mutual follow / within range" (isMutual below is a
  // stub, never real data), so guessing there would just swap one flash
  // ("can't comment" then "you can") for another. gatePending below keeps the
  // composer's spot neutral instead of asserting a guess.
  const policy = resolveCommentPolicy(safePost);
  const gatePending = gateReason === undefined && !isAuthor && (policy === "NEIGHBORS" || policy === "MUTUALS");
  const canComment = gateReason
    ? gateReason === "OK"
    : localGate({ policy, isAuthor, isMutual: false }).ok || isAuthor;
  const gate = gateCopy(gateReason ?? "OK");
  const liked = likeOverride ?? safePost.liked;
  const likeCount = Math.max(0, safePost.likes + (likeOverride === true && !safePost.liked ? 1 : 0) - (likeOverride === false && safePost.liked ? 1 : 0));
  const showLikeCount = !safePost.hideLikeCount || isAuthor;
  const policyBadgeLabel = policyBadge(policy);
  const saved = saveOverride ?? safePost.saved ?? false;
  // Reply counts feed the "Top" ranking, so they're computed alongside it.
  const sortedTopLevel = sortComments(
    comments
      .filter((c) => !c.parentId)
      .map((c) => ({
        ...c,
        reactionCount: Object.values(c.reactions ?? {}).reduce((a, b) => a + b, 0),
        replyCount: comments.filter((r) => r.parentId === c.id).length,
      })),
    commentSort
  );
  const votedOption = votes[safePost.id] ?? safePost.votedOptionId;
  const totalVotes = (safePost.pollOptions?.reduce((s, o) => s + o.votes, 0) ?? 0) + (votedOption && !safePost.votedOptionId ? 1 : 0);
  const resolved = resolvedOverride ?? safePost.resolved ?? false;
  // "Resolved" only makes sense for these two types — a giveaway/poll/shoutout
  // never had an outstanding thing to resolve.
  const canMarkResolved = isAuthor && (safePost.type === "LOST_FOUND" || safePost.type === "ALERT");
  const typeMeta = COMMUNITY_TYPE_META[safePost.type];
  const detailMedia = postMedia(safePost);
  const pollClosed = isPollClosed(safePost);
  // Polls show their voting deadline; alerts show when they clear from the feed.
  const expiryLabel = safePost.type === "POLL"
    ? timeLeftLabel(safePost.pollEndsAt)
    : timeLeftLabel(safePost.expiresAt);

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

  async function handleSave() {
    const next = !saved;
    haptics.selection();
    setSaveOverride(next); // optimistic
    try {
      await communityService.toggleSave(safePost.id, saved);
      showToast(next ? "Saved" : "Removed from saved");
    } catch {
      setSaveOverride(saved); // revert so the UI never lies
      showToast("Couldn't save — try again");
    }
  }

  /** Set/change/clear a reaction. Optimistic, and reverted from the server's own
   *  copy on failure rather than from a guess. */
  async function reactTo(c: Comment, emoji: string | null) {
    haptics.selection();
    const before = comments;
    setComments((prev) => prev.map((x) => {
      if (x.id !== c.id) return x;
      const tallies = { ...(x.reactions ?? {}) };
      // One reaction per person, so switching removes the previous one.
      if (x.myReaction) tallies[x.myReaction] = Math.max(0, (tallies[x.myReaction] ?? 1) - 1);
      if (emoji) tallies[emoji] = (tallies[emoji] ?? 0) + 1;
      return { ...x, reactions: tallies, myReaction: emoji };
    }));
    try {
      await communityService.reactToComment(c.id, emoji);
    } catch (e: any) {
      setComments(before);
      showToast(e?.message || "Couldn't react — try again");
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
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Go back"><ArrowLeft size={20} /></button>
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
        {/* Save and share, matching the feed card — the post you actually opened
            shouldn't offer fewer actions than its summary did. */}
        {!isGuest && (
          <button
            className="icon-btn"
            onClick={handleSave}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save this post"}
            style={{ color: saved ? "var(--brand-700)" : undefined }}
          >
            <Bookmark size={18} weight={saved ? "fill" : "regular"} />
          </button>
        )}
        <button className="icon-btn" onClick={() => setSharing(true)} aria-label="Share this post">
          <Share2 size={18} />
        </button>
        {!isGuest && !isAuthor && (
          <button className="icon-btn" onClick={() => setReporting(true)} aria-label="Report post">
            <Flag size={18} />
          </button>
        )}
      </header>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 72 }}>
        {/* Post body */}
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <div className="row gap-12 center-v" style={{ marginBottom: 14 }}>
            <SafeImg
              src={safePost.authorAvatar}
              variant={safePost.authorType === "business" ? "photo" : "avatar"}
              className="avatar"
              style={{
                width: 44, height: 44, borderRadius: "50%",
                border: safePost.authorType === "business" ? "2px solid var(--orange-500)" : safePost.authorType === "provider" ? "2px solid var(--green-500)" : "2px solid var(--ink-200)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)", flexShrink: 0,
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
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="semi small" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)" }}>{safePost.authorName}</div>
              <span className="tiny muted row gap-4 center-v" style={{ marginTop: 2, fontSize: 12 }}><MapPin size={11} />{safePost.area} • {safePost.postedAt}</span>
            </div>
          </div>
          <div className="row gap-8 center-v wrap" style={{ marginBottom: 8 }}>
            {safePost.type === "ALERT" && safePost.severity ? (
              <span className={`badge badge-${SEVERITY_TONE[safePost.severity]}`} style={{ fontSize: 11.5, padding: "3.5px 10px", borderRadius: 12, fontWeight: 700 }}>
                {severityMeta(safePost.severity).emoji} {severityMeta(safePost.severity).label}
              </span>
            ) : (
              <span className={`badge badge-${typeMeta.tone}`} style={{ fontSize: 11.5, padding: "3.5px 10px", borderRadius: 12, fontWeight: 600 }}>
                {typeMeta.emoji} {typeMeta.label}
              </span>
            )}
            {/* A time-boxed post says how long it has left, so nobody acts on a
                notice that's already over. */}
            {expiryLabel && (
              <span className="tiny semi row gap-4 center-v" style={{ fontSize: 11.5, color: "var(--ink-600)", background: "var(--ink-100)", border: "1px solid var(--ink-200)", padding: "2.5px 9px", borderRadius: 10 }}>
                <Clock size={11} /> {expiryLabel}
              </span>
            )}
          </div>
          <div className="bold" style={{ fontSize: 19, letterSpacing: "-0.4px", lineHeight: 1.3, color: "var(--ink-900)" }}>{safePost.title}</div>
          {safePost.body && <p className="small" style={{ marginTop: 8, lineHeight: 1.6, color: "var(--ink-700)", fontSize: 14.5 }}>{safePost.body}</p>}

          {/* Structured per-type facts, scannable instead of buried in the body. */}
          {(safePost.lastSeen || safePost.reward || safePost.pickupNote) && (
            <div className="col gap-6" style={{ marginTop: 12, padding: "11px 13px", background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 14 }}>
              {safePost.lastSeen && (
                <span className="small row gap-6 center-v" style={{ color: "var(--ink-800)", fontSize: 13.5 }}>
                  <MapPin size={13} color="var(--amber-700)" /> Last seen near <span className="semi">{safePost.lastSeen}</span>
                </span>
              )}
              {safePost.reward && (
                <span className="small row gap-6 center-v" style={{ color: "var(--ink-800)", fontSize: 13.5 }}>
                  <span aria-hidden="true">🎁</span> Reward: <span className="semi">{safePost.reward}</span>
                </span>
              )}
              {safePost.pickupNote && (
                <span className="small row gap-6 center-v" style={{ color: "var(--ink-800)", fontSize: 13.5 }}>
                  <Clock size={13} color="var(--green-600)" /> Pickup: <span className="semi">{safePost.pickupNote}</span>
                </span>
              )}
            </div>
          )}

          {/* The listing the author tagged (distinct from neighbor-added
              recommendations rendered further down). */}
          {safePost.taggedListing && (
            <button
              className="row gap-10 center-v"
              style={{ width: "100%", marginTop: 12, padding: "10px 12px", borderRadius: 14, background: "var(--brand-50)", border: "1px solid var(--brand-200)", textAlign: "left", cursor: "pointer" }}
              onClick={() => nav(safePost.taggedListing!.listingType === "BUSINESS" ? `/business/${safePost.taggedListing!.listingId}` : `/provider/${safePost.taggedListing!.listingId}`)}
            >
              <span style={{ fontSize: 18 }} aria-hidden="true">{safePost.taggedListing.listingType === "BUSINESS" ? "🏪" : "👤"}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="tiny" style={{ color: "var(--brand-700)" }}>{safePost.type === "SHOUTOUT" ? "Shoutout to" : "Tagged"}</div>
                <div className="semi small ellipsis" style={{ color: "var(--brand-900)" }}>{safePost.taggedListing.name}</div>
              </div>
              <ChevronRight size={14} color="var(--brand-600)" />
            </button>
          )}

          {/* Photo gallery — a horizontal strip when there's more than one, so a
              multi-photo post doesn't hide everything after the first. */}
          {detailMedia.length === 1 && (
            <SafeImg
              src={detailMedia[0]}
              alt={safePost.imageAlt || ""}
              style={{ width: "100%", maxHeight: 280, borderRadius: 16, marginTop: 14, objectFit: "cover", border: "1px solid var(--ink-200)" }}
            />
          )}
          {detailMedia.length > 1 && (
            <div className="media-strip" style={{ marginTop: 14 }}>
              {detailMedia.map((url, i) => (
                <SafeImg
                  key={url}
                  src={url}
                  alt={i === 0 ? (safePost.imageAlt || "") : `Photo ${i + 1}`}
                  style={{ width: 232, height: 232, flexShrink: 0, borderRadius: 16, objectFit: "cover", border: "1px solid var(--ink-200)" }}
                />
              ))}
            </div>
          )}

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
                    disabled={isGuest || pollClosed}
                    onClick={isGuest || pollClosed ? undefined : () => handleVote(o.id)}
                    style={{
                      position: "relative", textAlign: "left", padding: "12px 14px", borderRadius: 14,
                      border: voted ? "1.5px solid var(--brand-500)" : "1.5px solid var(--ink-200)",
                      overflow: "hidden", background: "var(--surface)", cursor: isGuest || pollClosed ? "default" : "pointer",
                      boxShadow: voted ? "0 2px 10px rgba(232, 62, 160, 0.2)" : "none",
                      transition: "transform 0.15s ease, border-color 0.2s ease"
                    }}
                  >
                    {votedOption && (
                      <div
                        style={{
                          position: "absolute", inset: 0, width: `${pct}%`,
                          background: voted ? "linear-gradient(90deg, var(--brand-100), var(--brand-50))" : "var(--ink-100)",
                          transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                          borderRadius: 12
                        }}
                      />
                    )}
                    <div className="row between" style={{ position: "relative", zIndex: 1 }}>
                      <span className="small semi" style={{ color: voted ? "var(--brand-900)" : "var(--ink-800)" }}>{o.label}</span>
                      {votedOption && <span className="small bold tabular-nums" style={{ color: "var(--brand-700)" }}>{pct}%</span>}
                    </div>
                  </button>
                );
              })}
              <span className="row between center-v">
                <span className="tiny muted semi">{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</span>
                {pollClosed && <span className="tiny semi" style={{ color: "var(--ink-500)" }}>Voting closed</span>}
              </span>
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

          {/* Like row — a guest sees the count as plain text, not a control.
              When the author hid the count, the button still works; only the
              number goes away (the author themselves still sees it). */}
          <div className="divider" style={{ margin: "14px 0" }} />
          <div className="row between center-v">
            {isGuest ? (
              <span className="row gap-6 small semi" style={{ color: "var(--ink-500)" }}>
                <Heart size={18} /> {showLikeCount ? `${likeCount} ${likeCount === 1 ? "like" : "likes"}` : "Like"}
              </span>
            ) : (
              <button
                className="row gap-6 small semi"
                style={{ color: liked ? "var(--red-500)" : "var(--ink-500)" }}
                onClick={handleLike}
                aria-label={liked ? "Unlike this post" : "Like this post"}
              >
                <Heart size={18} weight={liked ? "fill" : "regular"} />
                {showLikeCount ? `${likeCount} ${likeCount === 1 ? "like" : "likes"}` : liked ? "Liked" : "Like"}
              </button>
            )}
            {/* Readers see the thread's rules before they start typing. */}
            {policyBadgeLabel && (
              <span className="tiny semi" style={{ color: "var(--ink-500)", background: "var(--ink-100)", border: "1px solid var(--ink-200)", padding: "3px 9px", borderRadius: 10, fontSize: 11.5 }}>
                {policyBadgeLabel}
              </span>
            )}
          </div>
        </div>

        <div className="divider" style={{ margin: "14px 0", borderWidth: 4 }} />

        {/* Comments */}
        <div className="page-pad">
          <div className="row between center-v" style={{ marginBottom: 12 }}>
            <div className="semi small muted">
              {comments.length} comment{comments.length !== 1 ? "s" : ""}
            </div>
            {/* Worth having even on short threads: a long "ask neighbors" thread
                where the best answer arrived late is unreadable newest-first. */}
            {comments.length > 1 && (
              <div className="row gap-4" style={{ background: "var(--ink-100)", padding: 3, borderRadius: 10 }} role="radiogroup" aria-label="Sort comments">
                {([["top", "Top"], ["newest", "Newest"]] as [CommentSort, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={commentSort === value}
                    className="tiny semi"
                    style={{
                      padding: "4px 11px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12,
                      background: commentSort === value ? "var(--surface)" : "transparent",
                      color: commentSort === value ? "var(--brand-700)" : "var(--ink-600)",
                      boxShadow: commentSort === value ? "var(--shadow-sm)" : "none",
                    }}
                    onClick={() => { haptics.selection(); setCommentSort(value); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {commentsLoading ? (
            <ListSkeleton count={2} />
          ) : (
            <div className="col gap-16">
              {sortedTopLevel.map((c) => {
                // Replies stay chronological whatever the top-level sort is — a
                // reply thread is a conversation, and reordering it by score
                // would make the exchange unfollowable.
                const replies = comments.filter((r) => r.parentId === c.id);
                return (
                  <div key={c.id} className="col gap-12 queue-row-enter">
                    <CommentRow c={c} nav={nav} onReply={() => startReply(c)} canReply={canComment} canReact={canComment} onReact={(e) => reactTo(c, e)} />
                    {replies.length > 0 && (
                      <div className="col gap-12" style={{ marginLeft: 46, paddingLeft: 10, borderLeft: "2px solid var(--line)" }}>
                        {replies.map((r) => (
                          <CommentRow key={r.id} c={r} nav={nav} onReply={() => startReply(r)} compact canReply={canComment} canReact={canComment} onReact={(e) => reactTo(r, e)} />
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
      ) : gatePending ? (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "14px 12px max(14px, var(--safe-area-bottom))" }}>
          <p className="small muted center" style={{ margin: 0 }}>Checking if you can reply…</p>
        </div>
      ) : !canComment ? (
        // One notice, worded by reason. Previously two hardcoded strings
        // ("Comments are turned off" / "Follow each other to comment") had to
        // stand in for every situation, so someone simply outside the area was
        // told to follow the author — advice that wouldn't have helped.
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "14px 12px max(14px, var(--safe-area-bottom))" }}>
          <p className="small muted center" style={{ margin: 0 }}>{gate.message}</p>
          {gateReason === "NOT_MUTUAL" && authorUserId && (
            <p className="center" style={{ margin: "8px 0 0" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => openProfile(authorUserId, "USER", { name: safePost.authorName, avatar: safePost.authorAvatar })}
              >
                View {safePost.authorName}'s profile
              </button>
            </p>
          )}
        </div>
      ) : (
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: "10px 12px max(10px, var(--safe-area-bottom))" }}>
        {/* Mention suggestions. Matched on public alias only, the same rule
            socialService.searchNeighbors follows — you can't find a neighbor by
            their real name here, so a mention can't confirm an identity. */}
        {mentionQuery && (mentionResults?.length ?? 0) > 0 && (
          <div className="mention-suggest" role="listbox" aria-label="Mention a neighbor">
            {mentionResults!.slice(0, 5).map((n) => (
              <button
                key={n.id}
                role="option"
                aria-selected={false}
                className="mention-suggest-row"
                onClick={() => pickMention(n.name)}
              >
                <SafeImg src={n.avatar} variant="avatar" className="avatar" style={{ width: 28, height: 28, flexShrink: 0 }} />
                <span className="semi small ellipsis">@{n.name}</span>
              </button>
            ))}
          </div>
        )}

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
          ref={inputRef}
          className="input"
          placeholder={replyingTo ? "Write a reply…" : "Add a comment… use @ to mention a neighbor"}
          value={newComment}
          rows={1}
          style={{ flex: 1, resize: "none", maxHeight: 80, overflowY: "auto", padding: "8px 12px", borderRadius: 20, lineHeight: 1.4, fontSize: 14 }}
          onChange={(e) => {
            setNewComment(e.target.value);
            // Read the mention from the caret, not from the whole string, so a
            // second @mention later in the comment is picked up correctly.
            setMentionQuery(mentionQueryAt(e.target.value, e.target.selectionStart ?? e.target.value.length));
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            // Enter picks the highlighted suggestion instead of sending, which is
            // what a visible autocomplete implies.
            if (e.key === "Escape" && mentionQuery) { setMentionQuery(null); return; }
            if (e.key === "Enter" && !e.shiftKey) {
              if (mentionQuery && (mentionResults?.length ?? 0) > 0) {
                e.preventDefault();
                pickMention(mentionResults![0].name);
                return;
              }
              e.preventDefault();
              sendComment();
            }
          }}
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

      {sharing && (
        <ShareCard
          title={safePost.title}
          subtitle={postShareSubtitle(safePost)}
          image={detailMedia[0] ?? safePost.authorAvatar}
          meta={typeMeta.label}
          url={postShareUrl(safePost.id)}
          onClose={() => setSharing(false)}
        />
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
