import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Loader, LogOut, ArrowRight, User } from "lucide-react";
import { useApp } from "@/store";
import { userService, uploadService } from "@/services";

const EMOJI_AVATARS = ["🦊", "🐯", "🐨", "🦉", "🎨", "🚀", "🍕", "🥑", "⚽", "🎯"];

export default function UserOnboard() {
  const nav = useNavigate();
  const { user, refreshUser, showToast, signOut } = useApp();
  const [name, setName] = useState(
    user.name && user.name !== "New user" ? user.name : ""
  );
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectEmoji(emoji: string) {
    const bgColors = ["#f87171", "#fb923c", "#fbbf24", "#34d399", "#60a5fa", "#818cf8", "#a78bfa", "#f472b6"];
    const randomBg = bgColors[Math.floor(Math.random() * bgColors.length)];
    const svgString = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='100%' height='100%' fill='${encodeURIComponent(
      randomBg
    )}'/><text x='50%' y='55%' font-size='56' text-anchor='middle' dominant-baseline='central'>${emoji}</text></svg>`;
    const dataUri = `data:image/svg+xml;utf8,${svgString}`;
    setAvatar(dataUri);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadService.upload(file, "avatar");
      setAvatar(url);
      showToast("Profile picture uploaded!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showToast(msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === "New user") {
      showToast("Please enter your name");
      return;
    }

    setSaving(true);
    try {
      await userService.update({
        name: trimmedName,
        avatar: avatar || undefined,
      });
      await refreshUser();
      showToast("Profile updated successfully!");
      nav("/auth/location");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update profile";
      showToast(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen" style={{ background: "var(--ink-50)" }}>
      <div className="screen-scroll page-pad col" style={{ paddingBottom: 40, alignItems: "center" }}>
        
        <div style={{ textAlign: "center", marginTop: 40, marginBottom: 28, width: "100%" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: "var(--ink-900)" }}>
            Welcome to STRYT
          </h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 15, lineHeight: 1.5 }}>
            Create your profile to join your local street.
          </p>
        </div>

        <div className="card" style={{ width: "100%", padding: 24, borderRadius: 20, boxShadow: "var(--shadow-md)", background: "#fff" }}>
          
          <div className="col center" style={{ gap: 12, marginBottom: 24 }}>
            <div style={{ position: "relative" }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  border: "3px solid var(--brand-100)",
                  background: "var(--ink-100)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative"
                }}
              >
                {avatar ? (
                  <img src={avatar} alt="Avatar Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <User size={40} color="var(--ink-400)" />
                )}
                {uploading && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff"
                  }}>
                    <Loader className="spin" size={20} />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  background: "var(--brand-600)",
                  border: "2px solid #fff",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)"
                }}
              >
                <Camera size={16} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: "none" }}
              />
            </div>
            <span className="tiny semi muted">Tap to upload a profile picture</span>
          </div>

          <div className="col" style={{ gap: 8, marginBottom: 24 }}>
            <span className="tiny semi" style={{ color: "var(--ink-600)" }}>Or choose an avatar:</span>
            <div className="row gap-8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
              {EMOJI_AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => selectEmoji(emoji)}
                  style={{
                    fontSize: 22,
                    padding: 8,
                    borderRadius: 10,
                    border: "1px solid var(--ink-200)",
                    background: "var(--ink-50)",
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = "scale(1.15)";
                    e.currentTarget.style.border = "1px solid var(--brand-500)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.border = "1px solid var(--ink-200)";
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 28 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "var(--ink-700)" }}>
              What should we call you?
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "12px 14px", fontSize: 16 }}
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              maxLength={40}
              required
            />
          </div>

          <button
            className="btn btn-primary btn-block row center gap-8"
            onClick={handleSave}
            disabled={saving || !name.trim() || name.trim() === "New user"}
            style={{ padding: "14px", fontSize: 16, fontWeight: 700 }}
          >
            {saving ? (
              <>
                <Loader className="spin" size={18} /> Saving...
              </>
            ) : (
              <>
                Continue <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            signOut();
            nav("/");
          }}
          className="row center gap-6"
          style={{
            marginTop: 32,
            background: "none",
            border: "none",
            color: "var(--ink-500)",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600
          }}
        >
          <LogOut size={16} /> Sign out
        </button>

      </div>
    </div>
  );
}
