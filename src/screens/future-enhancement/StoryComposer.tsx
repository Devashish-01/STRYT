import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Camera, Clock, Pencil } from "lucide-react";
import { businessService, uploadService } from "@/services";
import { socialService } from "@/services/engagement/socialService";
import { useQuery } from "@/hooks/useApi";
import { ErrorView } from "@/components/states";
import { useApp } from "@/store";

const ctas = ["None", "Order now", "Reserve", "Call us", "View offer"];
const EXPIRY_OPTS = [1, 3, 6, 12, 24] as const;

export default function StoryComposer() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: b } = useQuery(() => businessService.get(id), [id]);

  if (!id) {
    return (
      <div className="screen">
        <AppBar title="Create Story" />
        <ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} />
      </div>
    );
  }
  const { showToast } = useApp();
  const [image, setImage] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("Order now");
  const [hours, setHours] = useState<number>(6);
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const [uploading, setUploading] = useState(false);

  return (
    <div className="screen">
      <AppBar title="Post a story" subtitle="Expires automatically" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 90 }}>
        {/* Phone-style preview */}
        <label style={{ display: "block", position: "relative", width: "100%", aspectRatio: "9/14", maxHeight: 360, borderRadius: 18, overflow: "hidden", border: "2px dashed var(--ink-300)", background: "#000", cursor: "pointer" }}>
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                setUploading(true);
                try {
                  const url = await uploadService.upload(file, "story");
                  setImage(url);
                } catch {
                  showToast("Failed to upload image");
                } finally {
                  setUploading(false);
                }
              }
            }}
          />
          {image ? <img src={image} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.95 }} /> : (
            <span className="col center muted gap-6" style={{ height: "100%" }}><Camera size={30} /><span className="small">{uploading ? "Uploading…" : "Tap to add photo"}</span></span>
          )}
          {image && caption && (
            <div style={{ position: "absolute", bottom: 16, left: 14, right: 14, color: "#fff", fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>{caption}</div>
          )}
        </label>

        <div className="field"><label>Caption</label><input className="input" placeholder="e.g. Fresh batch just out 🔥" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} /></div>

        <div className="field">
          <label>Call to action</label>
          <div className="row wrap gap-8">
            {ctas.map((c) => <button key={c} className={`chip ${cta === c ? "active" : ""}`} onClick={() => setCta(c)}>{c}</button>)}
          </div>
        </div>

        <div className="field">
          <label className="row between">
            <span className="row gap-4"><Clock size={14} /> Expires after</span>
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
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12 }}>
        <button
          className="btn btn-primary btn-block"
          disabled={!image || !caption.trim()}
          onClick={async () => {
            try {
              await socialService.postStory({
                ownerType:    "business",
                ownerId:      id,
                authorName:   b?.name ?? "Business",
                authorAvatar: b?.coverImage ?? "",
                imageUrl:     image,
                caption:      caption.trim(),
                cta,
                expiresInHrs: hours,
              });
              showToast(`Story posted — live for ${hours}h ✨`);
              setTimeout(() => nav(-1), 600);
            } catch {
              showToast("Couldn't post story — please try again");
            }
          }}
        >
          Post story
        </button>
      </div>
    </div>
  );
}
