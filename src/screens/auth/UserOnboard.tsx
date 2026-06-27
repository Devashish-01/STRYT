import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Loader, LogOut, ArrowRight, User as UserIcon, ShieldAlert } from "lucide-react";
import { useApp } from "@/store";
import { userService, uploadService } from "@/services";

const EMOJI_AVATARS = ["🦊", "🐯", "🐨", "🦉", "🎨", "🚀", "🍕", "🥑", "⚽", "🎯"];

export default function UserOnboard() {
  const nav = useNavigate();
  const { user, refreshUser, showToast, signOut } = useApp();
  const [name, setName] = useState(
    user.name && user.name !== "New user" ? user.name : ""
  );
  
  // Compulsory: Alias / Username handle
  const defaultAlias = user.alias || (user.name && user.name !== "New user" 
    ? user.name.toLowerCase().replace(/[^a-z0-9_]/g, "") 
    : "");
  const [alias, setAlias] = useState(defaultAlias);

  // Optional fields
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [emergencyName, setEmergencyName] = useState(user.emergencyContactName || "");
  const [emergencyPhone, setEmergencyPhone] = useState(user.emergencyContact || "");

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
    const trimmedAlias = alias.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");

    if (!trimmedName || trimmedName === "New user") {
      showToast("Please enter your name");
      return;
    }

    if (!trimmedAlias) {
      showToast("Please enter a username / handle");
      return;
    }

    setSaving(true);
    try {
      await userService.update({
        name: trimmedName,
        alias: trimmedAlias,
        avatar: avatar || undefined,
        phone: phone || undefined,
        emergencyContact: emergencyPhone || undefined,
        emergencyContactName: emergencyName || undefined,
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
    <div
      className="screen"
      style={{
        background: "linear-gradient(160deg, #fdfbff 0%, #f5eefc 60%, #ece2f7 100%)",
        color: "var(--ink-900)",
      }}
    >
      {/* Glow blobs */}
      <div
        style={{
          position: "absolute",
          top: "-5%",
          left: "-10%",
          width: "250px",
          height: "250px",
          background: "rgba(139, 71, 245, 0.15)",
          borderRadius: "50%",
          filter: "blur(70px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "-10%",
          width: "220px",
          height: "220px",
          background: "rgba(255, 149, 0, 0.1)",
          borderRadius: "50%",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div
        className="screen-scroll page-pad col"
        style={{
          paddingBottom: 48,
          alignItems: "center",
          zIndex: 10,
          position: "relative",
        }}
      >
        <div style={{ textAlign: "center", marginTop: 32, marginBottom: 24, width: "100%" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              background: "linear-gradient(135deg, #8b47f5 0%, #7c3aed 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(124, 58, 237, 0.2)",
              margin: "0 auto 16px",
            }}
          >
            <svg width="34" height="34" viewBox="0 0 64 64">
              <path d="M32 11 C21.5 11 13 19.5 13 30 C13 43 32 56 32 56 C32 56 51 43 51 30 C51 19.5 42.5 11 32 11 Z" fill="#fff" />
              <path d="M32 41 C24 35 40 24 32 17" stroke="#7c3aed" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M32 41 C24 35 40 24 32 17" stroke="#ffb020" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeDasharray="0.5 3.8" />
            </svg>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, color: "var(--ink-900)" }}>
            Complete Profile
          </h1>
          <p style={{ marginTop: 6, fontSize: 14, color: "var(--ink-600)" }}>
            Fill your details to start connecting with your street.
          </p>
        </div>

        {/* Compulsory Info Card */}
        <div
          style={{
            width: "100%",
            background: "#fff",
            border: "1px solid var(--ink-200)",
            borderRadius: 24,
            padding: 24,
            boxShadow: "var(--shadow-md)",
            marginBottom: 20,
          }}
        >
          <div className="row gap-8" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 800, background: "rgba(239, 68, 68, 0.1)", color: "var(--red-500)", padding: "4px 10px", borderRadius: 8 }}>
              COMPULSORY
            </span>
          </div>

          {/* Name Field */}
          <div className="field" style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 13, color: "var(--ink-700)" }}>
              Full Name *
            </label>
            <input
              type="text"
              className="input"
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 16,
                background: "var(--ink-50)",
                border: "1.5px solid var(--ink-200)",
                borderRadius: 14,
                color: "var(--ink-900)",
                outline: "none",
              }}
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              maxLength={40}
              required
            />
          </div>

          {/* Username / Alias handle field */}
          <div className="field">
            <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 13, color: "var(--ink-700)" }}>
              Unique Handle / Username *
            </label>
            <div
              className="row"
              style={{
                background: "var(--ink-50)",
                border: "1.5px solid var(--ink-200)",
                borderRadius: 14,
                overflow: "hidden",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  padding: "12px 14px",
                  borderRight: "1px solid var(--ink-200)",
                  background: "var(--ink-100)",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--brand-700)",
                }}
              >
                @
              </span>
              <input
                type="text"
                className="input"
                style={{
                  border: "none",
                  background: "transparent",
                  flex: 1,
                  padding: "12px 14px",
                  fontSize: 16,
                  color: "var(--ink-900)",
                  outline: "none",
                }}
                placeholder="rahul_sharma"
                value={alias}
                onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                disabled={saving}
                maxLength={24}
                required
              />
            </div>
          </div>
        </div>

        {/* Optional Info Card */}
        <div
          style={{
            width: "100%",
            background: "#fff",
            border: "1px solid var(--ink-200)",
            borderRadius: 24,
            padding: 24,
            boxShadow: "var(--shadow-md)",
            marginBottom: 32,
          }}
        >
          <div className="row gap-8" style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 800, background: "var(--ink-100)", color: "var(--ink-600)", padding: "4px 10px", borderRadius: 8 }}>
              OPTIONAL DETAILS
            </span>
          </div>

          {/* Photo upload / Emoji Picker */}
          <div className="col center" style={{ gap: 12, marginBottom: 24 }}>
            <div style={{ position: "relative" }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: "50%",
                  border: "2.5px solid var(--brand-200)",
                  background: "var(--ink-50)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative"
                }}
              >
                {avatar ? (
                  <img src={avatar} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <UserIcon size={32} color="var(--ink-400)" />
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
                  bottom: -2,
                  right: -2,
                  background: "var(--brand-600)",
                  border: "2px solid #fff",
                  borderRadius: "50%",
                  width: 30,
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)"
                }}
              >
                <Camera size={14} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: "none" }}
              />
            </div>
            <span style={{ fontSize: 12, color: "var(--ink-500)" }}>Upload a custom profile photo</span>

            {/* Emoji Quick Picker */}
            <div className="col gap-6" style={{ width: "100%", marginTop: 12 }}>
              <span className="tiny semi" style={{ color: "var(--ink-500)", textAlign: "center" }}>Or pick an emoji:</span>
              <div className="row gap-6" style={{ flexWrap: "wrap", justifyContent: "center" }}>
                {EMOJI_AVATARS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => selectEmoji(emoji)}
                    style={{
                      fontSize: 20,
                      padding: 6,
                      borderRadius: 10,
                      border: "1px solid var(--ink-200)",
                      background: "var(--ink-50)",
                      cursor: "pointer",
                      transition: "all 0.15s"
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = "scale(1.15)";
                      e.currentTarget.style.borderColor = "var(--brand-500)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                      e.currentTarget.style.borderColor = "var(--ink-200)";
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional Phone Field */}
          <div className="field" style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 13, color: "var(--ink-700)" }}>
              Mobile Phone
            </label>
            <input
              type="tel"
              className="input"
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 16,
                background: "var(--ink-50)",
                border: "1.5px solid var(--ink-200)",
                borderRadius: 14,
                color: "var(--ink-900)",
                outline: "none",
              }}
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              disabled={saving}
              maxLength={10}
            />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--ink-100)", margin: "20px 0" }} />

          {/* Emergency Contacts Section */}
          <div className="col gap-12">
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red-500)", display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldAlert size={14} /> Emergency Contact (Highly Recommended)
            </span>
            
            <div className="field">
              <input
                type="text"
                className="input"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: 15,
                  background: "var(--ink-50)",
                  border: "1.5px solid var(--ink-200)",
                  borderRadius: 14,
                  color: "var(--ink-900)",
                  outline: "none",
                }}
                placeholder="Contact Person's Name"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="field">
              <input
                type="tel"
                className="input"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: 15,
                  background: "var(--ink-50)",
                  border: "1.5px solid var(--ink-200)",
                  borderRadius: 14,
                  color: "var(--ink-900)",
                  outline: "none",
                }}
                placeholder="Contact Person's Mobile"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value.replace(/\D/g, ""))}
                maxLength={10}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          className="btn btn-primary btn-block row center gap-8"
          onClick={handleSave}
          disabled={saving || !name.trim() || !alias.trim()}
          style={{ padding: "16px", fontSize: 16, fontWeight: 700, borderRadius: 16, width: "100%", zIndex: 10 }}
        >
          {saving ? (
            <>
              <Loader className="spin" size={18} /> Saving Details...
            </>
          ) : (
            <>
              Save & Get Started <ArrowRight size={18} />
            </>
          )}
        </button>

        {/* Log Out Button */}
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
            fontWeight: 600,
            zIndex: 10
          }}
        >
          <LogOut size={16} /> Sign out
        </button>

      </div>
    </div>
  );
}
