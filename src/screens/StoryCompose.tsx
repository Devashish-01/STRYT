import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, MapPin } from "lucide-react";
import { AppBar } from "@/components/common";
import { socialService, uploadService } from "@/services";
import { useApp } from "@/store";
import { currentUserId } from "@/lib/supabaseClient";

const EXPIRY_OPTS = [1, 3, 6, 12] as const;
type ExpiryHrs = (typeof EXPIRY_OPTS)[number];

export default function StoryCompose() {
  const nav = useNavigate();
  const { user, area, showToast } = useApp();
  const [image, setImage] = useState("");
  const [caption, setCaption] = useState("");
  const [hours, setHours] = useState<ExpiryHrs>(3);
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
          <label>Visible for</label>
          <div className="row gap-8">
            {EXPIRY_OPTS.map((h) => (
              <button
                key={h}
                className={`chip ${hours === h ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setHours(h)}
              >
                {h}h
              </button>
            ))}
          </div>
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
