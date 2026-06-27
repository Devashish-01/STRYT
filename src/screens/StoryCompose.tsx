import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, MapPin, Pencil } from "lucide-react";
import { AppBar } from "@/components/common";
import { socialService, uploadService } from "@/services";
import { useApp } from "@/store";
import { currentUserId } from "@/lib/supabaseClient";

const EXPIRY_OPTS = [1, 3, 6, 12] as const;

export default function StoryCompose() {
  const nav = useNavigate();
  const { user, area, showToast } = useApp();
  const [image, setImage] = useState("");
  const [caption, setCaption] = useState("");
  const [hours, setHours] = useState<number>(3);
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  async function post() {
    setPosting(true);
    try {
      const uid = await currentUserId();
      if (!uid) throw new Error("Not authenticated");

      let lat = user.lat;
      let lng = user.lng;
      if (!lat && !lng && navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
            () => resolve(),
            { timeout: 4000 }
          );
        });
      }

      await socialService.postStory({
        ownerType:    "user",
        userId:       uid,
        authorName:   user.name || "Neighbor",
        authorAvatar: user.avatar || "",
        imageUrl:     image,
        caption:      caption.trim(),
        cta:          "None",
        expiresInHrs: hours,
        lat:          lat || undefined,
        lng:          lng || undefined,
      });
      showToast(`Story live for ${hours}h — neighbors can see it ✨`);
      setTimeout(() => nav(-1), 600);
    } catch {
      showToast("Couldn't post story. Try again.");
      setPosting(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Share a moment" subtitle="Visible to neighbors nearby" />

      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {/* Photo picker — phone-story aspect ratio */}
        <label style={{
          display: "block", position: "relative", width: "100%",
          aspectRatio: "9/14", maxHeight: 380, borderRadius: 18, overflow: "hidden",
          border: "2px dashed var(--ink-300)", background: "#000", cursor: "pointer",
        }}>
          <input
            type="file" accept="image/*" style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                setImage(await uploadService.upload(file, "story"));
              } catch {
                showToast("Failed to upload photo");
              } finally {
                setUploading(false);
              }
            }}
          />
          {image ? (
            <>
              <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.95 }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent 40%)" }} />
              {caption && (
                <div style={{ position: "absolute", bottom: 16, left: 14, right: 14, color: "#fff", fontWeight: 600, fontSize: 15, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                  {caption}
                </div>
              )}
              <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.45)", borderRadius: 8, padding: "4px 8px" }}>
                <span className="tiny" style={{ color: "#fff" }}>Tap to change</span>
              </div>
            </>
          ) : (
            <span className="col center muted gap-6" style={{ height: "100%" }}>
              <Camera size={32} />
              <span className="small">{uploading ? "Uploading…" : "Tap to add photo"}</span>
            </span>
          )}
        </label>

        <div className="field">
          <label>Caption <span className="tiny muted">(optional)</span></label>
          <input
            className="input"
            placeholder="What's happening? 🔥"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={120}
          />
          {caption.length > 90 && (
            <span className="tiny muted" style={{ textAlign: "right" }}>{120 - caption.length} left</span>
          )}
        </div>

        <div className="field">
          <label className="row between">
            <span>Visible for</span>
            {hours > 0 && <span style={{ color: "var(--brand-700)", fontWeight: 600 }}>{hours} hour{hours > 1 ? "s" : ""}</span>}
          </label>
          {showCustom ? (
            <div className="row gap-8">
              <input
                type="number"
                min={1}
                max={168}
                className="input grow"
                style={{ padding: "8px 12px", fontSize: 13, height: 36 }}
                placeholder="Duration in hours..."
                value={customVal}
                onChange={(e) => setCustomVal(e.target.value)}
                autoFocus
              />
              <button
                className="btn btn-primary btn-sm"
                style={{ height: 36, padding: "0 12px" }}
                onClick={() => {
                  const n = parseInt(customVal);
                  if (!isNaN(n) && n > 0) setHours(n);
                  setShowCustom(false);
                }}
              >
                Apply
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ height: 36, padding: "0 12px" }}
                onClick={() => setShowCustom(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="row gap-8">
              {EXPIRY_OPTS.map((h) => {
                const active = hours === h;
                return (
                  <button
                    key={h}
                    className={`chip ${active ? "active" : ""}`}
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => { setHours(h); setShowCustom(false); }}
                  >
                    {h}h
                  </button>
                );
              })}
              <button
                className={`chip ${!new Set<number>(EXPIRY_OPTS).has(hours) ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => {
                  setCustomVal(!new Set<number>(EXPIRY_OPTS).has(hours) ? String(hours) : "");
                  setShowCustom(true);
                }}
              >
                <Pencil size={11} strokeWidth={2.5} />
                {!new Set<number>(EXPIRY_OPTS).has(hours) ? `${hours}h` : "Custom"}
              </button>
            </div>
          )}
        </div>

        <div className="card row gap-10" style={{ padding: 12, background: "var(--brand-50)", border: "1px solid var(--brand-100)" }}>
          <MapPin size={18} color="var(--brand-700)" />
          <span className="tiny" style={{ color: "var(--brand-700)", lineHeight: 1.4 }}>
            Visible within ~2 km of <strong>{area || "your location"}</strong> · auto-detected
          </span>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        {!image && (
          <p className="tiny muted" style={{ textAlign: "center", marginBottom: 6 }}>Add a photo to continue</p>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!image || posting || uploading}
          onClick={() => void post()}
        >
          {posting ? "Posting…" : uploading ? "Uploading photo…" : "Share story"}
        </button>
      </div>
    </div>
  );
}
