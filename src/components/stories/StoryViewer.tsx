import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Ban, ChevronRight, DotsThree, EyeOff, Flag, Plus, Send, Star, Trash2, X } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import ReportSheet from "@/components/ReportSheet";
import UnderReviewNotice from "@/features/moderation/UnderReviewNotice";
import { chatService, socialService } from "@/services";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { haptics } from "@/lib/haptics";
import { errorMessage } from "@/lib/errorMessage";
import { groupStories, hoursLeft, storyAge, storyOwnerKey, type StoryGroup, type StoryPointer } from "@/lib/stories";
import type { Story } from "@/types";
import { StoryConfirm, StoryDetailsSheet, StoryMenuSheet, type MenuItem } from "./StorySheets";
import { useStoryPlayer } from "./useStoryPlayer";
import { useStoryViews } from "./useStoryViews";
import { resolveReplyTarget } from "./storyReply";

const REACTIONS = ["❤️", "😂", "😮", "👏", "🔥"] as const;

export interface StoryViewerProps {
  /** Pre-built groups (the rail) … */
  groups?: StoryGroup[];
  startGroupIndex?: number;
  startStoryIndex?: number;
  /** … or a flat list (Highlights, My activity, the map): grouped by author here. */
  stories?: Story[];
  startIndex?: number;
  onClose: () => void;
  /** A story was deleted, or its author muted/blocked — the opener may want to refresh what it shows. */
  onChanged?: () => void;
}

type Burst = { id: number; emoji: string; left: number };
type Pending = null | "menu" | "details" | "report" | "delete" | "block";

export function StoryViewer({ groups: inputGroups, startGroupIndex, startStoryIndex, stories, startIndex, onClose, onChanged }: StoryViewerProps) {
  const nav = useNavigate();
  const { t, tf } = useI18n();
  const { user, ownedBusinessIds, ownedProviderId, showToast, isGuest, markStoryViewed } = useApp();
  const requireAuth = useRequireAuth();

  // ── what is being shown ─────────────────────────────────
  const baseGroups = useMemo<StoryGroup[]>(() => inputGroups ?? groupStories(stories ?? []), [inputGroups, stories]);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const groups = useMemo(
    () => baseGroups.map((g) => ({ ...g, stories: g.stories.filter((s) => !removed.has(s.id)) })).filter((g) => g.stories.length > 0),
    [baseGroups, removed],
  );

  const start = useMemo<StoryPointer>(() => {
    if (inputGroups) return { group: startGroupIndex ?? 0, story: startStoryIndex ?? 0 };
    const target = stories?.[startIndex ?? 0];
    if (!target) return { group: 0, story: 0 };
    const key = storyOwnerKey(target);
    const g = baseGroups.findIndex((x) => x.key === key);
    return { group: Math.max(0, g), story: Math.max(0, (baseGroups[g]?.stories.findIndex((s) => s.id === target.id) ?? 0)) };
    // Computed once, for the story that was tapped; later changes to the lists must not move the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pending, setPending] = useState<Pending>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageState, setImageState] = useState<{ id: string; state: "ready" | "failed" } | null>(null);

  const paused = pending !== null || inputFocused || sending;

  // Closing from inside a sheet, a dialog or by swipe all end here.
  const close = useCallback(() => onClose(), [onClose]);

  const player = useStoryPlayer({ groups, start, onClose: close, paused });
  const { pointer, group, story, held, dragY, dragging, stageHandlers, registerFill, markReady, goNext, goPrev } = player;

  const imageOk = !story?.image || (imageState?.id === story.id && imageState.state === "ready");
  const imageFailed = !!story?.image && imageState?.id === story.id && imageState.state === "failed";

  const isOwn = !!story && (
    (story.userId && story.userId === user.id) ||
    (story.businessId && ownedBusinessIds?.includes(story.businessId)) ||
    (story.providerId && story.providerId === ownedProviderId)
  );

  // ── seen / viewed ───────────────────────────────────────
  const storyId = story?.id;
  useEffect(() => {
    if (!storyId) return;
    markStoryViewed(storyId);
    if (!isOwn && !isGuest) {
      socialService.recordStoryView(storyId).catch((err) => console.warn("recordStoryView failed:", err));
    }
  }, [storyId, isOwn, isGuest, markStoryViewed]);

  // Nothing left to show (the last story was deleted): leave.
  useEffect(() => { if (groups.length === 0) close(); }, [groups.length, close]);

  // Warm the next photo so the tap forward is instant.
  const nextImage = useMemo(() => {
    const g = groups[pointer.group];
    if (!g) return undefined;
    return g.stories[pointer.story + 1]?.image ?? groups[pointer.group + 1]?.stories[0]?.image;
  }, [groups, pointer]);
  useEffect(() => { if (nextImage) { const img = new Image(); img.src = nextImage; } }, [nextImage]);

  // ── own story: views, highlight ─────────────────────────
  const fmtAge = useCallback((unit: "now" | "m" | "h" | "d", n: number) => tf(`story_age_${unit}`, { n }), [tf]);
  const views = useStoryViews(story, !!isOwn, fmtAge);
  const [highlightOverride, setHighlightOverride] = useState<Record<string, boolean>>({});
  const highlighted = story ? (highlightOverride[story.id] ?? story.isHighlighted ?? false) : false;

  async function toggleHighlight() {
    if (!story) return;
    const next = !highlighted;
    setHighlightOverride((m) => ({ ...m, [story.id]: next }));
    try {
      await socialService.setStoryHighlight(story.id, next);
      showToast(next ? t("story_saved_toast") : t("story_unsaved_toast"));
    } catch {
      setHighlightOverride((m) => ({ ...m, [story.id]: !next }));
      showToast(t("story_highlight_failed"));
    }
  }

  // ── reply + reactions ───────────────────────────────────
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [myReaction, setMyReaction] = useState<Record<string, string>>({});
  const [bursts, setBursts] = useState<Burst[]>([]);
  const burstId = useRef(0);

  async function sendReply() {
    const text = draft.trim();
    if (!text || sending || !story) return;
    setSending(true);
    try {
      const target = await resolveReplyTarget(story);
      await chatService.replyToStory({ ...target, text, story: { id: story.id, image: story.image, caption: story.caption } });
      setDraft("");
      inputRef.current?.blur();
      void haptics.success();
      showToast(t("story_reply_sent"));
    } catch (e) {
      showToast(errorMessage(e, t("story_reply_failed")));
    } finally {
      setSending(false);
    }
  }

  async function react(emoji: string) {
    if (!story) return;
    const id = story.id;
    void haptics.light();
    setMyReaction((m) => ({ ...m, [id]: emoji }));
    const b: Burst = { id: ++burstId.current, emoji, left: 20 + Math.random() * 60 };
    setBursts((x) => [...x, b]);
    window.setTimeout(() => setBursts((x) => x.filter((y) => y.id !== b.id)), 1300);
    try {
      await socialService.reactToStory(id, emoji);
    } catch {
      setMyReaction((m) => { const rest = { ...m }; delete rest[id]; return rest; });
      showToast(t("story_react_failed"));
    }
  }

  // ── the ⋯ menu's actions ────────────────────────────────
  const ownerId = story ? (story.businessId || story.providerId || story.userId || "") : "";
  const ownerType = story?.authorType ?? "user";
  const [mutedNow, setMutedNow] = useState(false);
  useEffect(() => {
    if (!story || isOwn || isGuest) { setMutedNow(false); return; }
    let live = true;
    void socialService.myStoryMutes().then((set) => { if (live) setMutedNow(set.has(storyOwnerKey(story))); });
    return () => { live = false; };
  }, [story, isOwn, isGuest]);

  const authorLabel = group?.authorName ?? "";

  async function doMute() {
    if (!story) return;
    setPending(null);
    try {
      if (mutedNow) {
        await socialService.unmuteStoryAuthor(ownerType, ownerId);
        setMutedNow(false);
        showToast(tf("story_unmuted_toast", { name: authorLabel }));
      } else {
        await socialService.muteStoryAuthor(ownerType, ownerId);
        showToast(tf("story_muted_toast", { name: authorLabel }));
        onChanged?.();
        close();
      }
    } catch (e) {
      showToast(errorMessage(e, t("story_action_failed")));
    }
  }

  async function doBlock() {
    if (!story?.userId) return;
    setBusy(true);
    try {
      await socialService.blockUser(story.userId);
      showToast(tf("story_blocked_toast", { name: authorLabel }));
      onChanged?.();
      close();
    } catch (e) {
      setBusy(false);
      setPending(null);
      showToast(errorMessage(e, t("story_action_failed")));
    }
  }

  async function doDelete() {
    if (!story) return;
    setBusy(true);
    try {
      await socialService.deleteStory(story);
      setRemoved((r) => new Set(r).add(story.id));
      showToast(t("story_deleted_toast"));
      onChanged?.();
    } catch {
      showToast(t("story_delete_failed"));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function addToStory() {
    if (!story) return;
    close();
    nav("/story/new", {
      state: story.businessId
        ? { businessId: story.businessId, businessName: story.authorName, businessAvatar: story.authorAvatar }
        : story.providerId
          ? { providerId: story.providerId, providerName: story.authorName, providerAvatar: story.authorAvatar }
          : undefined,
    });
  }

  const menuItems: MenuItem[] = !story ? [] : isOwn
    ? [
        { key: "details", icon: <Star size={20} />, label: t("story_menu_details"), onClick: () => setPending("details") },
        { key: "save", icon: <Star size={20} weight={highlighted ? "fill" : "regular"} />, label: highlighted ? t("story_menu_unsave") : t("story_menu_save"), onClick: () => { setPending(null); void toggleHighlight(); } },
        { key: "delete", icon: <Trash2 size={20} />, label: t("story_menu_delete"), danger: true, onClick: () => setPending("delete") },
      ]
    : [
        { key: "report", icon: <Flag size={20} />, label: t("story_menu_report"), danger: true, onClick: () => (isGuest ? requireAuth(() => undefined, t("story_signin_to_report"))() : setPending("report")) },
        { key: "mute", icon: <EyeOff size={20} />, label: tf(mutedNow ? "story_menu_unmute" : "story_menu_mute", { name: authorLabel }), hint: mutedNow ? undefined : t("story_mute_hint"), onClick: () => (isGuest ? requireAuth(() => undefined, t("story_signin_to_mute"))() : void doMute()) },
        ...(story.authorType === "user" && story.userId
          ? [{ key: "block", icon: <Ban size={20} />, label: tf("story_menu_block", { name: authorLabel }), danger: true, onClick: () => (isGuest ? requireAuth(() => undefined, t("story_signin_to_block"))() : setPending("block")) } satisfies MenuItem]
          : []),
      ];

  // ── keyboard (desktop) ──────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending || inputFocused) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, inputFocused, close, goNext, goPrev]);

  // Freeze the page behind the viewer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!story || !group) return null;

  const profilePath = isOwn ? "/profile" : story.tapTarget || "";
  const ctaLabel = story.authorType === "business" ? t("story_visit_shop") : story.authorType === "provider" ? t("story_visit_profile") : t("story_see_profile");
  const age = storyAge(story.createdAt, fmtAge);
  const left = hoursLeft(story);
  const showCta = !isOwn && !!profilePath;
  const viewCount = views.viewers.length;
  const mine = myReaction[story.id];

  return createPortal(
    <div
      className={`sv-root${held ? " sv-held" : ""}${inputFocused ? " sv-typing" : ""}`}
      data-back-close
      role="dialog"
      aria-modal="true"
      aria-label={tf("story_of", { name: story.authorName })}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="sv-col"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px) scale(${1 - Math.min(dragY, 320) / 1600})` : undefined,
          borderRadius: dragY > 0 ? 22 : 0,
          transition: dragging ? "none" : "transform .22s ease, border-radius .22s ease",
        }}
      >
        {/* The photo: whole, never cropped, over a blurred copy of itself. */}
        {story.image && !imageFailed ? (
          <>
            <img className="sv-bg" src={story.image} alt="" aria-hidden="true" />
            <img
              key={story.id}
              className={`sv-img${imageOk ? " on" : ""}`}
              src={story.image}
              alt=""
              draggable={false}
              onLoad={() => { setImageState({ id: story.id, state: "ready" }); markReady(story.id); }}
              onError={() => { setImageState({ id: story.id, state: "failed" }); markReady(story.id); }}
            />
            {!imageOk && <div className="sv-spinner" aria-hidden="true" />}
          </>
        ) : (
          <div className="sv-fallback" />
        )}
        <div className="sv-shade top" />
        <div className="sv-shade bot" />

        {/* Gesture layer — below every control, above the photo. */}
        <div className="sv-stage" {...stageHandlers} />

        <div className="sv-chrome sv-bars" aria-hidden="true">
          {group.stories.map((s, i) => (
            <div key={s.id} className="sv-bar"><i ref={(el) => registerFill(i, el)} /></div>
          ))}
        </div>

        <div className="sv-chrome sv-head">
          <button className="sv-who" onClick={() => { if (profilePath) { close(); nav(profilePath); } }} disabled={!profilePath}>
            <SafeImg src={story.authorAvatar} variant="avatar" style={{ width: 36, height: 36, border: "2px solid var(--white)" }} />
            <span className="sv-who-txt">
              <span className="sv-name">
                {isOwn && story.authorType === "user" ? t("story_your") : story.authorName}
                {story.visibility === "close_friends" && <em className="sv-badge">{t("story_close_friends")}</em>}
              </span>
              <span className="sv-age">{age}{isOwn ? ` · ${left < 1 ? t("story_expires_soon") : tf("story_expires_in", { n: left })}` : ""}</span>
            </span>
          </button>
          <span className="sv-grow" />
          <button className="sv-ico" onClick={() => setPending("menu")} aria-label={t("story_more")}><DotsThree size={26} weight="bold" /></button>
          <button className="sv-ico" onClick={close} aria-label={t("story_close")}><X size={24} /></button>
        </div>

        <div className="sv-chrome sv-low">
          {story.hiddenAt && <UnderReviewNotice kind="item" />}
          {story.caption && <p className="sv-caption">{story.caption}</p>}
          {showCta && (
            <button className="sv-cta" onClick={() => { close(); nav(profilePath); }}>
              {ctaLabel} <ChevronRight size={15} />
            </button>
          )}
        </div>

        {/* Reactions floating up. */}
        <div className="sv-bursts" aria-hidden="true">
          {bursts.map((b) => <span key={b.id} style={{ left: `${b.left}%` }}>{b.emoji}</span>)}
        </div>

        {/* Bottom bar — a reply box for someone else's story, your numbers for your own. */}
        {isOwn ? (
          <div className="sv-chrome sv-own">
            <button className="sv-pill" onClick={() => setPending("details")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
              {viewCount === 1 ? t("story_views_one") : tf("story_views_n", { n: viewCount })}
            </button>
            <span className="sv-grow" />
            <button className={`sv-pill${highlighted ? " on" : ""}`} onClick={() => void toggleHighlight()}>
              <Star size={15} weight={highlighted ? "fill" : "regular"} /> {highlighted ? t("story_saved") : t("story_save")}
            </button>
            <button className="sv-pill" onClick={addToStory}><Plus size={15} /> {t("story_add_more")}</button>
          </div>
        ) : (
          <div className="sv-chrome sv-reply">
            {inputFocused && !isGuest && (
              <div className="sv-emoji-row">
                {REACTIONS.map((emoji) => (
                  <button key={emoji} className={mine === emoji ? "on" : ""} aria-label={tf("story_react_aria", { emoji })} onPointerDown={(e) => e.preventDefault()} onClick={() => void react(emoji)}>{emoji}</button>
                ))}
              </div>
            )}
            <div className="sv-reply-row">
              {isGuest ? (
                <button className="sv-input guest" onClick={requireAuth(() => undefined, t("story_signin_to_reply"))}>{t("story_signin_to_reply")}</button>
              ) : (
                <>
                  <input
                    ref={inputRef}
                    className="sv-input"
                    value={draft}
                    maxLength={500}
                    placeholder={tf("story_reply_to", { name: story.authorName })}
                    aria-label={t("story_reply_aria")}
                    enterKeyHint="send"
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void sendReply(); } }}
                  />
                  {draft.trim() ? (
                    <button className="sv-send" onPointerDown={(e) => e.preventDefault()} onClick={() => void sendReply()} disabled={sending} aria-label={t("story_reply_send")}><Send size={20} weight="fill" /></button>
                  ) : (
                    <button className={`sv-heart${mine === "❤️" ? " on" : ""}`} onClick={() => void react("❤️")} aria-label={tf("story_react_aria", { emoji: "❤️" })}>{mine ?? "🤍"}</button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {pending === "menu" && <StoryMenuSheet items={menuItems} onClose={() => setPending(null)} />}
        {pending === "details" && isOwn && (
          <StoryDetailsSheet story={story} viewers={views.viewers} loading={views.loading} privacyUsers={views.privacyUsers} loadingPrivacy={views.loadingPrivacy} onClose={() => setPending(null)} />
        )}
        {pending === "delete" && (
          <StoryConfirm title={t("story_delete_title")} body={t("story_delete_body")} confirmLabel={t("story_delete_confirm")} busy={busy} onConfirm={() => void doDelete()} onClose={() => setPending(null)} />
        )}
        {pending === "block" && (
          <StoryConfirm title={tf("story_block_title", { name: authorLabel })} body={t("story_block_body")} confirmLabel={t("story_block_confirm")} busy={busy} onConfirm={() => void doBlock()} onClose={() => setPending(null)} />
        )}
        {pending === "report" && (
          <ReportSheet targetType="STORY" targetId={story.id} name={t("story_report_name")} onClose={() => setPending(null)} />
        )}
      </div>
    </div>,
    document.body,
  );
}
