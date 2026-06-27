import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar } from "@/components/common";
import { Camera, Plus, X } from "lucide-react";
import { communityService, uploadService } from "@/services";
import { useApp } from "@/store";
import type { CommunityPostType } from "@/types";

const types: { type: CommunityPostType; label: string; emoji: string; hint: string }[] = [
  { type: "RECOMMENDATION", label: "Ask neighbors", emoji: "💬", hint: "Get recommendations for a place or service" },
  { type: "LOST_FOUND", label: "Lost & Found", emoji: "🔍", hint: "Report something lost or found nearby" },
  { type: "ALERT", label: "Alert", emoji: "📢", hint: "Water cut, road closed, safety notice" },
  { type: "GIVEAWAY", label: "Giveaway", emoji: "🎁", hint: "Give away something for free" },
  { type: "POLL", label: "Poll", emoji: "📊", hint: "Ask the neighborhood to vote" },
  { type: "SHOUTOUT", label: "Shoutout", emoji: "🙌", hint: "Thank a local business or neighbor" },
];

export default function CommunityCompose() {
  const nav = useNavigate();
  const { area, user, showToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<CommunityPostType | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pollOpts, setPollOpts] = useState(["", ""]);
  const [posting, setPosting] = useState(false);

  const canPost =
    !!type && title.trim().length > 3 && (type !== "POLL" || pollOpts.filter((o) => o.trim()).length >= 2) && !posting;

  async function post() {
    if (!type) return;
    setPosting(true);
    try {
      await communityService.create({
        type,
        title,
        body,
        image: photoUrl ?? undefined,
        area,
        lat: user.lat || undefined,
        lng: user.lng || undefined,
        pollOptions: type === "POLL" ? pollOpts.filter((o) => o.trim()).map((label, i) => ({ id: `o${i}`, label, votes: 0 })) : undefined,
      });
      showToast("Posted to community 🏘️");
      setTimeout(() => nav("/community-hub"), 500);
    } catch {
      showToast("Couldn't post. Try again.");
      setPosting(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Post to community" subtitle={area} />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        <div className="field">
          <label>What kind of post?</label>
          <div className="col gap-8">
            {types.map((t) => (
              <button
                key={t.type}
                className="card row gap-12"
                style={{ padding: 12, textAlign: "left", border: type === t.type ? "2px solid var(--brand-600)" : "1.5px solid var(--ink-200)" }}
                onClick={() => setType(t.type)}
              >
                <span style={{ fontSize: 24 }}>{t.emoji}</span>
                <div className="grow">
                  <div className="semi small">{t.label}</div>
                  <div className="tiny muted">{t.hint}</div>
                </div>
                <span style={{ width: 18, height: 18, borderRadius: "50%", border: type === t.type ? "5px solid var(--brand-600)" : "2px solid var(--ink-300)" }} />
              </button>
            ))}
          </div>
        </div>

        {type && (
          <>
            <div className="field">
              <label>Title *</label>
              <input className="input" placeholder={type === "RECOMMENDATION" ? "e.g. Reliable dentist near KP?" : "Short and clear"} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>Details</label>
              <textarea className="input" placeholder="Add more context…" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>

            {type === "POLL" && (
              <div className="field">
                <label>Poll options</label>
                <div className="col gap-8">
                  {pollOpts.map((o, i) => (
                    <div key={i} className="row gap-8">
                      <input className="input grow" placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setPollOpts((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
                      {pollOpts.length > 2 && <button className="icon-btn" onClick={() => setPollOpts((p) => p.filter((_, j) => j !== i))}><X size={16} /></button>}
                    </div>
                  ))}
                  {pollOpts.length < 4 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setPollOpts((p) => [...p, ""])}><Plus size={14} /> Add option</button>
                  )}
                </div>
              </div>
            )}

            {(type === "LOST_FOUND" || type === "GIVEAWAY") && (
              <div className="field">
                <label>Photo</label>
                {photoUrl ? (
                  <div style={{ position: "relative", width: 110 }}>
                    <img src={photoUrl} className="thumb" style={{ width: 110, height: 110, borderRadius: 12, objectFit: "cover" }} />
                    <button className="icon-btn" style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, background: "#ef4444", color: "#fff" }} onClick={() => setPhotoUrl(null)}><X size={14} /></button>
                  </div>
                ) : (
                  <label style={{ cursor: "pointer" }}>
                    <div className="col center" style={{ width: 110, height: 110, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 4 }}>
                      <Camera size={22} /><span className="tiny">{uploading ? "Uploading…" : "Add photo"}</span>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        try {
                          const url = await uploadService.upload(file, "community");
                          setPhotoUrl(url);
                        } catch { /* ignore */ } finally {
                          setUploading(false);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button className="btn btn-primary btn-block" disabled={!canPost} onClick={post}>
          {posting ? "Posting…" : "Post to your street"}
        </button>
      </div>
    </div>
  );
}
