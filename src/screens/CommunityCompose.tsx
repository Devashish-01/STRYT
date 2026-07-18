import { useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Camera, Plus, X, Store, Wrench, Image } from "@/components/Icons";
import { communityService, uploadService, businessService, providerService } from "@/services";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";
import type { CommunityPostType } from "@/types";

interface SellerContext {
  type: "business" | "provider";
  id: string;
  name: string;
  avatar?: string;
}

/** Reads the seller identity the ManageDashboard/ProviderDashboard "Post to community"
 *  tile passed via route state — absent for the regular customer compose entry, in
 *  which case the post goes out under the signed-in user's own name as before. */
function readSellerContext(state: unknown): SellerContext | null {
  const s = (state ?? {}) as Record<string, any>;
  if (s.businessId) return { type: "business", id: s.businessId, name: s.businessName ?? "Business", avatar: s.businessAvatar };
  if (s.providerId) return { type: "provider", id: s.providerId, name: s.providerName ?? "Provider", avatar: s.providerAvatar };
  return null;
}

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
  const loc = useLocation();
  const { area, user, showToast, activeContext } = useApp();

  const { data: activeBiz } = useQuery(
    () => activeContext.type === "business" && activeContext.id ? businessService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type]
  );
  const { data: activeProv } = useQuery(
    () => activeContext.type === "provider" && activeContext.id ? providerService.get(activeContext.id) : Promise.resolve(null),
    [activeContext.id, activeContext.type]
  );

  const passedCtx = readSellerContext(loc.state);
  const sellerCtx = passedCtx || (
    activeContext.type === "business" && activeBiz ? {
      type: "business" as const,
      id: activeBiz.id,
      name: activeBiz.name,
      avatar: activeBiz.coverImage
    } : activeContext.type === "provider" && activeProv ? {
      type: "provider" as const,
      id: activeProv.id,
      name: activeProv.displayName,
      avatar: activeProv.avatar
    } : null
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadService.upload(file, "community");
      setPhotoUrl(url);
    } catch { /* ignore */ } finally {
      setUploading(false);
    }
  }
  const [type, setType] = useState<CommunityPostType | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pollOpts, setPollOpts] = useState(["", ""]);
  const [allowComments, setAllowComments] = useState(false); // comments OFF by default
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
        allowComments,
        pollOptions: type === "POLL" ? pollOpts.filter((o) => o.trim()).map((label, i) => ({ id: `o${i}`, label, votes: 0 })) : undefined,
        ...(sellerCtx ? { authorType: sellerCtx.type, authorRefId: sellerCtx.id, authorName: sellerCtx.name, authorAvatar: sellerCtx.avatar } : {}),
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
        {sellerCtx && (
          <div
            className="card row gap-10 center-v"
            style={{
              padding: 12,
              background: sellerCtx.type === "business" ? "var(--orange-50)" : "var(--green-100)",
              border: `1px solid ${sellerCtx.type === "business" ? "var(--orange-100)" : "var(--green-500)"}`,
            }}
          >
            <SafeImg
              src={sellerCtx.avatar}
              variant={sellerCtx.type === "provider" ? "avatar" : "photo"}
              className="thumb"
              style={{ width: 38, height: 38, borderRadius: 8 }}
            />
            <div className="grow">
              <div className="tiny muted">Posting as</div>
              <div className="semi small">{sellerCtx.name}</div>
            </div>
            <span
              className="badge row gap-4 center-v"
              style={{
                background: sellerCtx.type === "business" ? "var(--orange-100)" : "var(--green-100)",
                color: sellerCtx.type === "business" ? "var(--orange-500)" : "var(--green-600)",
              }}
            >
              {sellerCtx.type === "business" ? <Store size={11} /> : <Wrench size={11} />}
              {sellerCtx.type === "business" ? "Business" : "Provider"}
            </span>
          </div>
        )}

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

            {/* Comments are OFF by default; posters opt in. When on, only the
                poster and neighbors who follow each other can comment. */}
            <div className="field">
              <button
                type="button"
                className="row between align-center"
                onClick={() => setAllowComments((v) => !v)}
                style={{ width: "100%", padding: "12px 14px", background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 14, cursor: "pointer", textAlign: "left" }}
                aria-pressed={allowComments}
              >
                <div className="col" style={{ gap: 2 }}>
                  <span className="semi small">Allow comments</span>
                  <span className="tiny muted">
                    {allowComments ? "Mutual followers can comment" : "Comments are turned off"}
                  </span>
                </div>
                <span style={{
                  width: 44, height: 26, borderRadius: 999, flexShrink: 0, position: "relative",
                  background: allowComments ? "var(--brand-600)" : "var(--ink-300)",
                  transition: "background 0.15s ease",
                }}>
                  <span style={{
                    position: "absolute", top: 3, left: allowComments ? 21 : 3,
                    width: 20, height: 20, borderRadius: "50%", background: "#fff",
                    transition: "left 0.15s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </span>
              </button>
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
                    <button className="icon-btn" style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, background: "var(--red-500)", color: "#fff" }} onClick={() => setPhotoUrl(null)}><X size={14} /></button>
                  </div>
                ) : (
                  <div className="row gap-8">
                    <button
                      className="col center"
                      style={{ width: 110, height: 110, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 4, opacity: uploading ? 0.6 : 1 }}
                      disabled={uploading}
                      onClick={() => cameraRef.current?.click()}
                    >
                      <Camera size={22} /><span className="tiny">{uploading ? "…" : "Camera"}</span>
                    </button>
                    <button
                      className="col center"
                      style={{ width: 110, height: 110, borderRadius: 12, border: "2px dashed var(--ink-300)", color: "var(--ink-500)", gap: 4, opacity: uploading ? 0.6 : 1 }}
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Image size={22} /><span className="tiny">{uploading ? "…" : "Gallery"}</span>
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={pickPhoto} />
                  </div>
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
