import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronRight, Plus, Camera, Globe, Star } from "@/components/Icons";
import { socialService } from "@/services";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { SafeImg } from "@/components/common";
import { useApp } from "@/store";
import type { Story } from "@/types";
import { getSupabase } from "@/lib/supabaseClient";

interface AuthorGroup {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: "business" | "provider" | "user";
  stories: Story[];
}

export function StoriesBar() {
  const { viewedStories, user, isGuest } = useApp();
  const nav = useNavigate();
  
  // Track open group index in allGroups list
  const [open, setOpen] = useState<number | null>(null);

  const savedRadius = localStorage.getItem("settings_radius");
  const radius = savedRadius ? parseFloat(savedRadius) : 5;
  const { data, loading } = useQueryWithRealtime(
    () => user.lat && user.lng
      ? socialService.storiesNearby(user.lat, user.lng, radius)
      : socialService.stories(),
    "stories",
    [user.lat, user.lng, radius]
  );
  const { data: myStory }  = useQueryWithRealtime(() => socialService.myStory(), "stories", [user.id]);

  const stories = data ?? [];

  // Group stories by author
  const groupsMap = new Map<string, AuthorGroup>();
  stories.forEach((s) => {
    // Exclude current user's stories to avoid duplication since we display it as "My story"
    const isMe = s.userId === user.id || 
                 (s.authorName === user.name && s.authorAvatar === user.avatar);
    if (isMe) return;

    const authorId = s.businessId || s.providerId || s.userId || s.authorName;
    if (!groupsMap.has(authorId)) {
      groupsMap.set(authorId, {
        authorId,
        authorName: s.authorName,
        authorAvatar: s.authorAvatar,
        authorType: s.authorType,
        stories: [],
      });
    }
    groupsMap.get(authorId)!.stories.push(s);
  });

  const otherGroups = Array.from(groupsMap.values());

  // Check if all stories in a group are viewed
  const isGroupSeen = (g: AuthorGroup) => 
    g.stories.every((s) => viewedStories.includes(s.id));

  // Sort groups: unseen first, seen last
  const sortedOtherGroups = [...otherGroups].sort(
    (a, b) => Number(isGroupSeen(a)) - Number(isGroupSeen(b))
  );

  // Prepend current user's active story as Group 0 if it exists
  const myStoryGroup: AuthorGroup | null = myStory ? {
    authorId: "me",
    authorName: "My story",
    authorAvatar: user.avatar || "",
    authorType: "user",
    stories: [myStory]
  } : null;

  const allGroups = myStoryGroup ? [myStoryGroup, ...sortedOtherGroups] : sortedOtherGroups;

  function handleMyStoryTap() {
    if (myStory) {
      setOpen(0); // Plays "My Story" (at index 0)
    } else {
      nav("/story/new");
    }
  }

  return (
    <>
      <div className="hscroll" style={{ paddingTop: 14, paddingBottom: 4 }}>
        {/* Your story / Add story — a guest has no story to add or show, so the
            tile is dropped entirely rather than offering a dead "+". They can
            still watch everyone else's. */}
        {!isGuest && (
        <button className="col center" style={{ gap: 6, width: 70, flexShrink: 0 }} onClick={handleMyStoryTap}>
          <div style={{ position: "relative", width: 64, height: 64 }}>
            {myStory ? (
              // Active story - show avatar with gradient ring
              <div style={{
                width: 64, height: 64, borderRadius: "50%", padding: 2.5,
                background: "linear-gradient(135deg,#ff8400,var(--pink-500),var(--brand-600))",
                boxShadow: "0 4px 14px rgba(236, 72, 153, 0.35)",
              }}>
                <SafeImg
                  src={user.avatar}
                  alt="Your story"
                  variant="avatar"
                  style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }}
                />
              </div>
            ) : (
              // No active story - show add plus circle
              <div style={{
                width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, var(--brand-50), var(--ink-50))",
                display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--brand-400)",
                boxShadow: "0 2px 10px rgba(139, 92, 246, 0.12)",
              }}>
                <Plus size={24} color="var(--brand-600)" />
              </div>
            )}
            {/* Camera / Plus badge on bottom-right */}
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: 22, height: 22, borderRadius: "50%",
              background: "var(--brand-600)",
              border: "2px solid #fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}>
              {myStory ? <Plus size={12} color="#fff" /> : <Camera size={11} color="#fff" />}
            </div>
          </div>
          <span className="tiny semi" style={{ textAlign: "center" }}>
            {myStory ? "My story" : "Your story"}
          </span>
        </button>
        )}

        {/* Other users' stories grouped by author */}
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="col center" style={{ gap: 6, width: 70, flexShrink: 0 }}>
                <div className="skel" style={{ width: 64, height: 64, borderRadius: "50%" }} />
                <div className="skel" style={{ width: 44, height: 9, borderRadius: 4 }} />
              </div>
            ))
          : sortedOtherGroups.map((g, index) => {
              const seen = isGroupSeen(g);
              // Calculate group index in allGroups array
              const groupIndex = index + (myStoryGroup ? 1 : 0);
              return (
                <button
                  key={g.authorId}
                  className="col center"
                  style={{ gap: 6, width: 70, flexShrink: 0 }}
                  onClick={() => setOpen(groupIndex)}
                >
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%", padding: 2.5,
                    background: seen ? "var(--ink-200)" : "linear-gradient(135deg,#ff8400,var(--pink-500),var(--brand-600))",
                    boxShadow: seen ? "none" : "0 4px 14px rgba(236, 72, 153, 0.3)",
                  }}>
                    <SafeImg
                      src={g.authorAvatar}
                      alt={g.authorName}
                      variant="avatar"
                      style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }}
                    />
                  </div>
                  <span className="tiny semi ellipsis" style={{ maxWidth: 64, textAlign: "center" }}>
                    {g.authorName.split(" ")[0]}
                  </span>
                </button>
              );
            })}
      </div>

      {/* Fullscreen Story Viewer (Instagram / Snapchat grouped behavior) */}
      {open !== null && (
        <StoryViewer
          groups={allGroups}
          startGroupIndex={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

interface StoryViewerProps {
  groups?: AuthorGroup[];
  startGroupIndex?: number;
  
  // Backward compatibility support for flat story arrays (e.g. MapView.tsx)
  stories?: Story[];
  startIndex?: number;
  
  onClose: () => void;
}

const REACTIONS = ["❤️", "😂", "😮", "👏", "🔥"];

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function StoryViewer({
  groups: inputGroups,
  startGroupIndex,
  stories,
  startIndex,
  onClose,
}: StoryViewerProps) {
  const nav = useNavigate();
  const { markStoryViewed, user, ownedBusinessIds, ownedProviderId, showToast, isGuest } = useApp();

  const [viewers, setViewers] = useState<any[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [sheetTab, setSheetTab] = useState<"viewers" | "privacy">("viewers");
  const [privacyUsers, setPrivacyUsers] = useState<any[]>([]);
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(false);
  const [highlighting, setHighlighting] = useState(false);

  // 1. Resolve groups list: either use input groups or group flat stories by author
  const groups = inputGroups || (() => {
    if (!stories) return [];
    const groupsMap = new Map<string, AuthorGroup>();
    stories.forEach((s) => {
      const authorId = s.businessId || s.providerId || s.userId || s.authorName;
      if (!groupsMap.has(authorId)) {
        groupsMap.set(authorId, {
          authorId,
          authorName: s.authorName,
          authorAvatar: s.authorAvatar,
          authorType: s.authorType,
          stories: [],
        });
      }
      groupsMap.get(authorId)!.stories.push(s);
    });
    return Array.from(groupsMap.values());
  })();

  // 2. Resolve initial active group index
  const initialGroupIdx = () => {
    if (inputGroups) return startGroupIndex ?? 0;
    if (!stories) return 0;
    const targetStory = stories[startIndex ?? 0];
    if (!targetStory) return 0;
    const targetAuthorId = targetStory.businessId || targetStory.providerId || targetStory.userId || targetStory.authorName;
    const idx = groups.findIndex((g) => g.authorId === targetAuthorId);
    return idx >= 0 ? idx : 0;
  };

  // 3. Resolve initial active story index within the group
  const initialStoryIdx = (gIdx: number) => {
    if (inputGroups) return 0;
    if (!stories) return 0;
    const targetStory = stories[startIndex ?? 0];
    if (!targetStory) return 0;
    const activeG = groups[gIdx];
    const sIdx = activeG?.stories.findIndex((s) => s.id === targetStory.id);
    return sIdx >= 0 ? sIdx : 0;
  };

  // Unified Pointer state to prevent React state mismatch / intermediate render race conditions
  const [pointer, setPointer] = useState({
    groupIdx: initialGroupIdx(),
    storyIdx: initialStoryIdx(initialGroupIdx())
  });

  const [progress, setProgress] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  // A story whose image URL is empty/null or fails to load must NOT leave the
  // viewer stuck on the dark loading overlay forever (the <img> is opacity-0
  // until onLoad fires — with no onError/empty guard it never becomes visible).
  const [imageFailed, setImageFailed] = useState(false);

  const groupIdx = pointer.groupIdx;
  const storyIdx = pointer.storyIdx;

  const activeGroup = groups[groupIdx];
  const story = activeGroup?.stories[storyIdx];

  const isOwnStory = story && (
    story.userId === user.id ||
    (story.businessId && ownedBusinessIds?.includes(story.businessId)) ||
    (story.providerId && story.providerId === ownedProviderId) ||
    (story.authorName === user.name && story.authorAvatar === user.avatar)
  );

  // Reset indices / mark as viewed / save view in DB
  useEffect(() => {
    if (!story) return;
    markStoryViewed(story.id);

    if (!isOwnStory) {
      socialService.recordStoryView(story.id).catch((err) => {
        console.warn("recordStoryView failed:", err);
      });
    }

    setProgress(0);
    setImageLoaded(false); // Reset image load status to trigger transition
    setImageFailed(false); // Reset failure flag for the newly active story
    setShowViewersSheet(false);
    setMyReaction(null);
    setHighlighted(story.isHighlighted ?? false);
  }, [groupIdx, storyIdx, story?.id, isOwnStory]);

  async function sendReaction(emoji: string) {
    if (!story) return;
    setMyReaction(emoji); // optimistic — a failed reaction isn't worth interrupting the viewing flow over
    try {
      await socialService.reactToStory(story.id, emoji);
    } catch {
      showToast("Couldn't send reaction");
    }
  }

  async function toggleHighlight() {
    if (!story) return;
    const next = !highlighted;
    setHighlighted(next); // optimistic
    setHighlighting(true);
    try {
      await socialService.setStoryHighlight(story.id, next);
      showToast(next ? "Saved to Highlights" : "Removed from Highlights");
    } catch {
      setHighlighted(!next);
      showToast("Couldn't update Highlights");
    } finally {
      setHighlighting(false);
    }
  }

  // Fetch viewers if own story
  useEffect(() => {
    if (!story || !isOwnStory) return;
    setLoadingViewers(true);
    socialService.getStoryViewers(story.id)
      .then((data) => {
        setViewers(data);
      })
      .catch((err) => {
        console.warn("getStoryViewers failed:", err);
      })
      .finally(() => {
        setLoadingViewers(false);
      });
  }, [story?.id, isOwnStory]);

  // While the owner has the viewer sheet open, new views should appear live
  // instead of only being visible on the next time the story is opened.
  useEffect(() => {
    if (!story || !isOwnStory) return;
    const sb = getSupabase();
    const channel = sb
      .channel(`rt:story_views:${story.id}`)
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "story_views", filter: `story_id=eq.${story.id}` }, () => {
        socialService.getStoryViewers(story.id).then(setViewers).catch(() => {});
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [story?.id, isOwnStory]);

  // Fetch profiles of allowed/hidden users for privacy settings if they exist
  useEffect(() => {
    if (!story || !isOwnStory) return;
    const ids = story.visibility === "close_friends" ? story.allowedUserIds : story.hiddenUserIds;
    if (!ids || ids.length === 0) {
      setPrivacyUsers([]);
      return;
    }

    const fetchPrivacyUsers = async () => {
      setLoadingPrivacy(true);
      try {
        const sb = getSupabase();
        const { data, error } = await sb.from("users")
          .select("id, name, avatar")
          .in("id", ids);
        if (!error && data) {
          setPrivacyUsers(data);
        }
      } catch (err: any) {
        console.warn("Failed to fetch privacy users:", err);
      } finally {
        setLoadingPrivacy(false);
      }
    };

    void fetchPrivacyUsers();
  }, [story?.id, story?.visibility, isOwnStory]);

  // Reset sheet tab when active story changes
  useEffect(() => {
    setSheetTab("viewers");
  }, [story?.id]);

  // Handle active progress bar loading (4000ms duration)
  useEffect(() => {
    if (!story || showViewersSheet) return;
    const start = Date.now() - (progress * 4000);
    const duration = 4000;
    const interval = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setProgress(p);
      if (p >= 1) {
        clearInterval(interval);
        handleNext();
      }
    }, 40);
    return () => clearInterval(interval);
  }, [groupIdx, storyIdx, showViewersSheet, progress]);

  if (!activeGroup || !story) return null;

  const handleNext = () => {
    // If active group has more stories, play next story
    if (storyIdx < activeGroup.stories.length - 1) {
      setPointer({ groupIdx, storyIdx: storyIdx + 1 });
    } 
    // Otherwise, transition to next group/user's stories
    else if (groupIdx < groups.length - 1) {
      setPointer({ groupIdx: groupIdx + 1, storyIdx: 0 });
    } 
    // No more groups, exit viewer
    else {
      onClose();
    }
  };

  const handlePrev = () => {
    // If not on first story of active user, go to previous story
    if (storyIdx > 0) {
      setPointer({ groupIdx, storyIdx: storyIdx - 1 });
    } 
    // Otherwise, transition to last story of previous user/group
    else if (groupIdx > 0) {
      const prevGroup = groups[groupIdx - 1];
      setPointer({ groupIdx: groupIdx - 1, storyIdx: prevGroup.stories.length - 1 });
    } 
    // If on first story of first user, restart progress
    else {
      setProgress(0);
    }
  };

  const getProfilePath = () => {
    if (!story) return "";
    const isMe = story.userId === user.id || 
                 (story.authorName === user.name && story.authorAvatar === user.avatar);
    if (isMe) return "/profile";
    if (story.tapTarget) return story.tapTarget;
    if (story.authorType === "business" && story.businessId) {
      return `/business/${story.businessId}`;
    }
    if (story.authorType === "provider" && story.providerId) {
      return `/provider/${story.providerId}`;
    }
    if (story.authorType === "user" && story.userId) {
      return `/u/${story.userId}`;
    }
    return "";
  };

  const profilePath = getProfilePath();
  const handleHeaderClick = (e: any) => {
    e.stopPropagation();
    if (profilePath) {
      onClose();
      nav(profilePath);
    }
  };

  const ctaLabel = story.authorType === "business"
    ? "Visit shop"
    : story.authorType === "provider"
    ? "Visit profile"
    : "See profile";

  return (
    // Full-viewport backdrop — same two-layer pattern as .overlay/.sheet
    // elsewhere in the app (outer: unconstrained fixed backdrop centering via
    // flexbox; inner: the actual phone-width column). The previous version
    // put max-width + left:50% + transform on this SAME fixed/inset:0 element,
    // which is over-constrained: with left, right (from inset:0), AND
    // max-width all fighting, the box resolved to 50% of the viewport width
    // (not min(100%, 480px)) on any screen narrower than 960px — i.e. every
    // phone — rendering as a narrow centered strip with whatever sits behind
    // it (map, page content) visible on both sides.
    <div style={{
      position: "fixed", inset: 0, background: "#000", zIndex: 2000,
      display: "flex", justifyContent: "center",
    }}>
      <style>{`
        @keyframes story-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        position: "relative", width: "100%", maxWidth: "var(--maxw)", height: "100%",
        overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center",
      }}>

      {/* Progress Bars (Instagram style: segments show only active user's stories) */}
      <div className="row gap-4" style={{ position: "absolute", top: "calc(10px + var(--safe-area-top))", left: 12, right: 12, zIndex: 3 }}>
        {activeGroup.stories.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${i < storyIdx ? 100 : i === storyIdx ? progress * 100 : 0}%`,
              background: "#fff",
              transition: i === storyIdx ? "none" : "width 0.1s ease"
            }} />
          </div>
        ))}
      </div>

      {/* Header (Author Avatar, Name, timestamp and Close button) */}
      <div className="row between" style={{ position: "absolute", top: "calc(24px + var(--safe-area-top))", left: 12, right: 12, zIndex: 3 }}>
        <div 
          className="row gap-8" 
          onClick={handleHeaderClick} 
          style={{ cursor: profilePath ? "pointer" : "default", opacity: 0.95 }}
          onMouseEnter={(e) => { if (profilePath) e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { if (profilePath) e.currentTarget.style.opacity = "0.95"; }}
        >
          <SafeImg src={story.authorAvatar} variant="avatar" className="avatar" style={{ width: 36, height: 36, border: "2px solid #fff" }} />
          <div className="col" style={{ gap: 0 }}>
            <div className="row align-center gap-6">
              <span className="semi small" style={{ color: "#fff", textDecoration: profilePath ? "underline decoration-transparent hover:decoration-white transition" : "none" }}>{story.authorName}</span>
              {story.visibility === "close_friends" && (
                <span style={{
                  background: "var(--green-500)",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "1px 5px",
                  borderRadius: 4,
                  letterSpacing: 0.5,
                  textTransform: "uppercase"
                }}>
                  Close Friends
                </span>
              )}
            </div>
            <span className="tiny" style={{ color: "rgba(255,255,255,0.8)" }}>
              {story.postedAt} · expires in {story.expiresInHrs}h
            </span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close stories"><X size={26} color="#fff" /></button>
      </div>

      {/* Navigation Touch Zones */}
      {/* Left 35% - go back */}
      <button
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "35%", zIndex: 2, cursor: "w-resize" }}
        onClick={handlePrev}
        aria-label="Previous story"
      />
      {/* Right 35% - go forward */}
      <button
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "35%", zIndex: 2, cursor: "e-resize" }}
        onClick={handleNext}
        aria-label="Next story"
      />

      {/* Background layer. Three states, in priority order:
          1. no image / image failed → a neutral gradient so the story still
             "shows" (caption, CTA and reactions sit on top) instead of a
             permanent black screen behind an endless spinner.
          2. image present but still decoding → the loading spinner.
          3. image decoded → nothing (the <img> below covers it). */}
      {(!story.image || imageFailed) ? (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#2b2b3a,#14141c)", zIndex: 1 }} />
      ) : !imageLoaded ? (
        <div style={{ position: "absolute", inset: 0, background: "var(--ink-900)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
          <div style={{
            width: 32, height: 32,
            border: "3px solid rgba(255,255,255,0.15)",
            borderTop: "3px solid #fff",
            borderRadius: "50%",
            animation: "story-spin 0.8s linear infinite"
          }} />
        </div>
      ) : null}

      {/* Active Story Image (keyed to force a reload per story). onError flips
          imageFailed so a broken/inaccessible URL falls back to the gradient
          above rather than hanging on the spinner with an invisible <img>. */}
      {story.image && !imageFailed && (
        <img
          key={story.id}
          src={story.image}
          alt=""
          onLoad={() => setImageLoaded(true)}
          onError={() => { setImageFailed(true); setImageLoaded(true); }}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: imageLoaded ? 0.95 : 0,
            transition: "opacity 0.2s ease"
          }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent 40%)" }} />

      {/* Caption + CTA Link */}
      <div style={{ position: "absolute", bottom: `calc(${isOwnStory ? 76 : 74}px + var(--safe-area-bottom))`, left: 16, right: 16, zIndex: 3 }}>
        {story.caption && (
          <div style={{
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
            padding: "10px 14px", borderRadius: 8, marginBottom: 14
          }}>
            <p style={{ color: "#fff", fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{story.caption}</p>
          </div>
        )}
        
        {story.cta !== "None" && story.tapTarget ? (
          <button
            className="btn btn-block btn-primary"
            style={{ background: "#fff", color: "var(--brand-700)", boxShadow: "0 8px 20px rgba(0,0,0,0.15)" }}
            onClick={() => { onClose(); nav(story.tapTarget); }}
          >
            {story.cta || ctaLabel} <ChevronRight size={16} />
          </button>
        ) : (
          !isOwnStory && profilePath && (
            <button
              className="btn btn-block"
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", marginTop: 8 }}
              onClick={() => { onClose(); nav(profilePath); }}
            >
              {ctaLabel} <ChevronRight size={16} />
            </button>
          )
        )}
      </div>

      {/* Quick reactions — tap to react, tap another to change it. Guests watch
          stories but can't react (a reaction notifies the author). */}
      {!isOwnStory && !isGuest && (
        <div className="row between" style={{ position: "absolute", bottom: "calc(16px + var(--safe-area-bottom))", left: 16, right: 16, zIndex: 3 }}>
          {REACTIONS.map((emoji) => {
            const active = myReaction === emoji;
            return (
              <button
                key={emoji}
                onClick={(e) => { e.stopPropagation(); sendReaction(emoji); }}
                aria-label={`React ${emoji}`}
                style={{
                  width: 42, height: 42, borderRadius: "50%", fontSize: 20,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.15)",
                  border: active ? "2px solid #fff" : "1px solid rgba(255,255,255,0.35)",
                  backdropFilter: "blur(6px)",
                  transform: active ? "scale(1.12)" : "scale(1)",
                  transition: "transform 0.15s ease, background 0.15s ease",
                }}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}

      {/* Story owner view counter + save-to-highlights buttons */}
      {isOwnStory && (
        <div style={{
          position: "absolute", bottom: "calc(20px + var(--safe-area-bottom))", left: 16, right: 16, zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8
        }}>
          <button
            onClick={() => setShowViewersSheet(true)}
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer"
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            {viewers.length} {viewers.length === 1 ? "view" : "views"}
          </button>
          <button
            onClick={toggleHighlight}
            disabled={highlighting}
            style={{
              background: highlighted ? "rgba(250, 204, 21, 0.25)" : "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              border: highlighted ? "1px solid var(--amber-500)" : "1px solid rgba(255, 255, 255, 0.3)",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer"
            }}
          >
            <Star size={15} color={highlighted ? "var(--amber-500)" : "#fff"} fill={highlighted ? "var(--amber-500)" : "none"} />
            {highlighted ? "Saved" : "Save"}
          </button>
        </div>
      )}

      {/* Viewers list bottom sheet */}
      {showViewersSheet && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
          display: "flex", flexDirection: "column", justifyContent: "flex-end"
        }}>
          <div style={{ flex: 1 }} onClick={() => setShowViewersSheet(false)} />
          
          <div style={{
            background: "var(--ink-900)",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTop: "1px solid rgba(255,255,255,0.1)",
            maxHeight: "65%",
            display: "flex",
            flexDirection: "column",
            animation: "slideUp 0.25s ease-out",
            padding: "24px 20px calc(24px + var(--safe-area-bottom))"
          }}>
            <style>{`
              @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
              }
            `}</style>

            <div className="row between align-center" style={{ marginBottom: 12 }}>
              <h2 className="h2" style={{ color: "#fff", margin: 0 }}>
                Story Details
              </h2>
              <button
                onClick={() => setShowViewersSheet(false)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                <X size={18} color="#fff" />
              </button>
            </div>

            {/* Bottom Sheet Tabs */}
            <div className="row gap-16" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 16 }}>
              <button
                onClick={() => setSheetTab("viewers")}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: sheetTab === "viewers" ? "2px solid #fff" : "2px solid transparent",
                  color: sheetTab === "viewers" ? "#fff" : "rgba(255,255,255,0.5)",
                  fontWeight: 700,
                  fontSize: 14,
                  padding: "8px 4px",
                  cursor: "pointer"
                }}
              >
                Viewers ({viewers.length})
              </button>
              <button
                onClick={() => setSheetTab("privacy")}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: sheetTab === "privacy" ? "2px solid var(--green-500)" : "2px solid transparent",
                  color: sheetTab === "privacy" ? "#fff" : "rgba(255,255,255,0.5)",
                  fontWeight: 700,
                  fontSize: 14,
                  padding: "8px 4px",
                  cursor: "pointer"
                }}
              >
                Audience & Privacy
              </button>
            </div>

            {sheetTab === "viewers" && (
              <div style={{ overflowY: "auto", flex: 1 }} className="col gap-12">
                {loadingViewers ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.5)" }}>
                    Loading viewers...
                  </div>
                ) : viewers.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
                    No views yet.
                  </div>
                ) : (
                  viewers.map((v) => (
                    <div key={v.userId} className="row between align-center" style={{ padding: "6px 0" }}>
                      <div className="row gap-12 align-center">
                        <SafeImg
                          src={v.avatar}
                          variant="avatar"
                          style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
                        />
                        <div className="col" style={{ gap: 0 }}>
                          <span className="semi" style={{ color: "#fff", fontSize: 14 }}>
                            {v.name}
                          </span>
                        </div>
                        {v.reaction && <span style={{ fontSize: 16 }}>{v.reaction}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                        {timeAgo(v.viewedAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {sheetTab === "privacy" && (
              <div style={{ overflowY: "auto", flex: 1 }} className="col gap-16">
                <div style={{
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 12,
                  padding: 14,
                  border: "1px solid rgba(255,255,255,0.1)"
                }}>
                  <div className="row gap-10 align-center">
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: story.visibility === "everyone" ? "rgba(160,32,224,0.15)" : "rgba(34,197,94,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      {story.visibility === "everyone" ? (
                        <Globe size={16} color="var(--brand-300)" />
                      ) : (
                        <Star size={16} color="var(--green-500)" fill="var(--green-500)" />
                      )}
                    </div>
                    <div className="col" style={{ gap: 2 }}>
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
                        {story.visibility === "everyone" ? "Public Story" : "Close Friends Only"}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                        {story.visibility === "everyone"
                          ? "Visible to all neighbors within radius."
                          : "Only visible to selected close friends."}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="col gap-8">
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {story.visibility === "close_friends"
                      ? `Allowed Neighbors (${story.allowedUserIds?.length || 0})`
                      : `Hidden From (${story.hiddenUserIds?.length || 0})`}
                  </span>

                  {loadingPrivacy ? (
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, padding: "10px 0" }}>
                      Loading lists...
                    </div>
                  ) : privacyUsers.length === 0 ? (
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "10px 0", fontStyle: "italic" }}>
                      {story.visibility === "close_friends"
                        ? "No specific close friends selected (Visible to you only)."
                        : "Not hidden from any neighbors."}
                    </div>
                  ) : (
                    <div className="col gap-10">
                      {privacyUsers.map((u) => (
                        <div key={u.id} className="row between align-center" style={{ padding: "4px 0" }}>
                          <div className="row gap-10 align-center">
                            <SafeImg
                              src={u.avatar}
                              variant="avatar"
                              style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
                            />
                            <div className="col" style={{ gap: 0 }}>
                              <span className="semi" style={{ color: "#fff", fontSize: 13 }}>
                                {u.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
