import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppBar, SafeImg } from "@/components/common";
import { Camera, Clock } from "lucide-react";
import { businessService, uploadService } from "@/services";
import { socialService } from "@/services/socialService";
import { useQuery } from "@/hooks/useApi";
import { useApp } from "@/store";

const ctas = ["None", "Order now", "Reserve", "Call us", "View offer"];

export default function StoryComposer() {
  const { id = "b1" } = useParams();
  const nav = useNavigate();
  const { data: b } = useQuery(() => businessService.get(id), [id]);
  const { showToast } = useApp();
  const [image, setImage] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("Order now");
  const [hours, setHours] = useState(6);
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
          <label className="row between"><span className="row gap-4"><Clock size={14} /> Expires after</span><span style={{ color: "var(--brand-700)" }}>{hours} hours</span></label>
          <input type="range" min={1} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ width: "100%", accentColor: "#6b21cc" }} />
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
