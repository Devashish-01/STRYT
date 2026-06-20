import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronRight, Plus, Camera } from "lucide-react";
import { socialService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { SafeImg } from "@/components/common";
import { useApp } from "@/store";
import type { Story } from "@/types";

export function StoriesBar() {
  const { viewedStories, user } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState<number | null>(null);
  const [openMine, setOpenMine] = useState(false);

  const { data, loading } = useQuery(() => socialService.stories(), []);
  const { data: myStory }  = useQuery(() => socialService.myStory(), [user.id]);

  const stories = data ?? [];
  const ordered = [...stories].sort(
    (a, b) => Number(viewedStories.includes(a.id)) - Number(viewedStories.includes(b.id))
  );

  function handleMyStoryTap() {
    if (myStory) {
      // Open their own story in the viewer. Prepend it to the list so it shows first.
      setOpenMine(true);
    } else {
      nav("/story/new");
    }
  }

  return (
    <>
      <div className="hscroll" style={{ paddingTop: 14, paddingBottom: 4 }}>
        {/* Your story */}
        <button className="col center" style={{ gap: 6, width: 70, flexShrink: 0 }} onClick={handleMyStoryTap}>
          <div style={{ position: "relative", width: 64, height: 64 }}>
            {myStory ? (
              // User has an active story — show their avatar with gradient ring
              <div style={{ width: 64, height: 64, borderRadius: "50%", padding: 2.5, background: "linear-gradient(135deg,#ff8400,#ec4899,#7c3aed)" }}>
                <SafeImg
                  src={user.avatar}
                  alt="Your story"
                  variant="avatar"
                  style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }}
                />
              </div>
            ) : (
              // No active story — show add button
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--ink-100)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--ink-300)" }}>
                <Plus size={24} color="var(--ink-500)" />
              </div>
            )}
            {/* Camera badge on bottom-right */}
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: 22, height: 22, borderRadius: "50%",
              background: myStory ? "var(--brand-600)" : "var(--brand-600)",
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

        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="col center" style={{ gap: 6, width: 70, flexShrink: 0 }}>
                <div className="skel" style={{ width: 64, height: 64, borderRadius: "50%" }} />
                <div className="skel" style={{ width: 44, height: 9, borderRadius: 4 }} />
              </div>
            ))
          : ordered.map((s) => {
              const seen = viewedStories.includes(s.id);
              const idx  = stories.findIndex((x) => x.id === s.id);
              return (
                <button key={s.id} className="col center" style={{ gap: 6, width: 70, flexShrink: 0 }} onClick={() => setOpen(idx)}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%", padding: 2.5,
                    background: seen ? "var(--ink-200)" : "linear-gradient(135deg,#ff8400,#ec4899,#7c3aed)",
                  }}>
                    <SafeImg
                      src={s.authorAvatar} alt={s.authorName} variant="avatar"
                      style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }}
                    />
                  </div>
                  <span className="tiny semi ellipsis" style={{ maxWidth: 64, textAlign: "center" }}>
                    {s.authorName.split(" ")[0]}
                  </span>
                </button>
              );
            })}
      </div>

      {/* Viewer for other people's stories */}
      {open !== null && (
        <StoryViewer stories={stories} startIndex={open} onClose={() => setOpen(null)} />
      )}
      {/* Viewer for own active story */}
      {openMine && myStory && (
        <StoryViewer stories={[myStory]} startIndex={0} onClose={() => setOpenMine(false)} />
      )}
    </>
  );
}

export function StoryViewer({ stories, startIndex, onClose }: { stories: Story[]; startIndex: number; onClose: () => void }) {
  const nav = useNavigate();
  const { markStoryViewed } = useApp();
  const [idx, setIdx] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const story: Story | undefined = stories[idx];

  useEffect(() => {
    if (!story) return;
    markStoryViewed(story.id);
    setProgress(0);
    const start = Date.now();
    const dur = 4000;
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / dur);
      setProgress(p);
      if (p >= 1) {
        clearInterval(t);
        if (idx < stories.length - 1) setIdx(idx + 1);
        else onClose();
      }
    }, 40);
    return () => clearInterval(t);
  }, [idx]);

  if (!story) return null;

  const ctaLabel = story.authorType === "business"
    ? "Visit shop"
    : story.authorType === "provider"
    ? "Visit profile"
    : "See profile";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 300, maxWidth: "var(--maxw)", left: "50%", transform: "translateX(-50%)" }}>
      {/* Progress bars */}
      <div className="row gap-4" style={{ position: "absolute", top: 10, left: 12, right: 12, zIndex: 3 }}>
        {stories.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%`, background: "#fff" }} />
          </div>
        ))}
      </div>

      {/* Header */}
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
        <button onClick={onClose}><X size={26} color="#fff" /></button>
      </div>

      {/* Tap zones */}
      <button style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "35%", zIndex: 2 }} onClick={() => setIdx(Math.max(0, idx - 1))} />
      <button style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "35%", zIndex: 2 }} onClick={() => (idx < stories.length - 1 ? setIdx(idx + 1) : onClose())} />

      <img src={story.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.95 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent 40%)" }} />

      {/* Caption + CTA */}
      <div style={{ position: "absolute", bottom: 28, left: 16, right: 16, zIndex: 3 }}>
        {story.caption && (
          <p style={{ color: "#fff", fontSize: 16, fontWeight: 600, lineHeight: 1.4, marginBottom: 14 }}>{story.caption}</p>
        )}
        {story.cta !== "None" && story.tapTarget && (
          <button
            className="btn btn-block"
            style={{ background: "#fff", color: "#14111c" }}
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
