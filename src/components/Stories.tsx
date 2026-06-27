import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronRight, Plus, Camera } from "lucide-react";
import { socialService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { SafeImg } from "@/components/common";
import { useApp } from "@/store";
import type { Story } from "@/types";

interface AuthorGroup {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorType: "business" | "provider" | "user";
  stories: Story[];
}

export function StoriesBar() {
  const { viewedStories, user } = useApp();
  const nav = useNavigate();
  
  // Track open group index in allGroups list
  const [open, setOpen] = useState<number | null>(null);

  const savedRadius = localStorage.getItem("settings_radius");
  const radius = savedRadius ? parseFloat(savedRadius) : 5;
  const { data, loading } = useQuery(
    () => user.lat && user.lng
      ? socialService.storiesNearby(user.lat, user.lng, radius)
      : socialService.stories(),
    [user.lat, user.lng, radius]
  );
  const { data: myStory }  = useQuery(() => socialService.myStory(), [user.id]);

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
        {/* Your story / Add story */}
        <button className="col center" style={{ gap: 6, width: 70, flexShrink: 0 }} onClick={handleMyStoryTap}>
          <div style={{ position: "relative", width: 64, height: 64 }}>
            {myStory ? (
              // Active story - show avatar with gradient ring
              <div style={{
                width: 64, height: 64, borderRadius: "50%", padding: 2.5,
                background: "linear-gradient(135deg,#ff8400,#ec4899,#7c3aed)"
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
                width: 64, height: 64, borderRadius: "50%", background: "var(--ink-100)",
                display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--ink-300)"
              }}>
                <Plus size={24} color="var(--ink-500)" />
              </div>
            )}
            {/* Camera / Plus badge on bottom-right */}
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: 22, height: 22, borderRadius: "50%",
              background: "var(--brand-600)",
              border: "2px solid #fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {myStory ? <Plus size={12} color="#fff" /> : <Camera size={11} color="#fff" />}
            </div>
          </div>
          <span className="tiny semi" style={{ textAlign: "center" }}>
            {myStory ? "My story" : "Your story"}
          </span>
        </button>

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
                    background: seen ? "var(--ink-200)" : "linear-gradient(135deg,#ff8400,#ec4899,#7c3aed)",
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

export function StoryViewer({
  groups: inputGroups,
  startGroupIndex,
  stories,
  startIndex,
  onClose,
}: StoryViewerProps) {
  const nav = useNavigate();
  const { markStoryViewed } = useApp();

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

  const groupIdx = pointer.groupIdx;
  const storyIdx = pointer.storyIdx;

  const activeGroup = groups[groupIdx];
  const story = activeGroup?.stories[storyIdx];

  // Reset indices / mark as viewed when story/group changes
  useEffect(() => {
    if (!story) return;
    markStoryViewed(story.id);
    setProgress(0);
    setImageLoaded(false); // Reset image load status to trigger transition
  }, [groupIdx, storyIdx, story?.id]);

  // Handle active progress bar loading (4000ms duration)
  useEffect(() => {
    if (!story) return;
    const start = Date.now();
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
  }, [groupIdx, storyIdx]);

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

  const ctaLabel = story.authorType === "business"
    ? "Visit shop"
    : story.authorType === "provider"
    ? "Visit profile"
    : "See profile";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000", zIndex: 300,
      maxWidth: "var(--maxw)", left: "50%", transform: "translateX(-50%)",
      display: "flex", flexDirection: "column", justifyContent: "center"
    }}>
      <style>{`
        @keyframes story-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Progress Bars (Instagram style: segments show only active user's stories) */}
      <div className="row gap-4" style={{ position: "absolute", top: 10, left: 12, right: 12, zIndex: 3 }}>
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
      <div className="row between" style={{ position: "absolute", top: 24, left: 12, right: 12, zIndex: 3 }}>
        <div className="row gap-8">
          <SafeImg src={story.authorAvatar} variant="avatar" className="avatar" style={{ width: 36, height: 36, border: "2px solid #fff" }} />
          <div className="col" style={{ gap: 0 }}>
            <span className="semi small" style={{ color: "#fff" }}>{story.authorName}</span>
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

      {/* Background Loading Spinner while downloading new image */}
      {!imageLoaded && (
        <div style={{ position: "absolute", inset: 0, background: "#14111c", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
          <div style={{
            width: 32, height: 32,
            border: "3px solid rgba(255,255,255,0.15)",
            borderTop: "3px solid #fff",
            borderRadius: "50%",
            animation: "story-spin 0.8s linear infinite"
          }} />
        </div>
      )}

      {/* Active Story Image (with key to force reload and avoid showing previous image) */}
      <img
        key={story.id}
        src={story.image}
        alt=""
        onLoad={() => setImageLoaded(true)}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", opacity: imageLoaded ? 0.95 : 0,
          transition: "opacity 0.2s ease"
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent 40%)" }} />

      {/* Caption + CTA Link */}
      <div style={{ position: "absolute", bottom: 28, left: 16, right: 16, zIndex: 3 }}>
        {story.caption && (
          <div style={{
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
            padding: "10px 14px", borderRadius: 8, marginBottom: 14
          }}>
            <p style={{ color: "#fff", fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{story.caption}</p>
          </div>
        )}
        
        {story.cta !== "None" && story.tapTarget && (
          <button
            className="btn btn-block btn-primary"
            style={{ background: "#fff", color: "var(--brand-700)", boxShadow: "0 8px 20px rgba(0,0,0,0.15)" }}
            onClick={() => { onClose(); nav(story.tapTarget); }}
          >
            {story.cta || ctaLabel} <ChevronRight size={16} />
          </button>
        )}
        
        {story.authorType === "user" && (
          <button
            className="btn btn-block"
            style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", marginTop: 8 }}
            onClick={() => { onClose(); nav(story.tapTarget); }}
          >
            {ctaLabel} <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
