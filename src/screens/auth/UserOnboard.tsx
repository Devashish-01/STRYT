import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  Loader,
  LogOut,
  ArrowRight,
  User as UserIcon,
  ShieldAlert,
  MapPin,
  Navigation,
  Globe,
  Sliders,
  X,
} from "lucide-react";
import { useApp } from "@/store";
import { userService, uploadService } from "@/services";
import { reverseGeocode, forwardGeocode, type GeoPlace } from "@/lib/geocode";

const EMOJI_AVATARS = ["🦊", "🐯", "🐨", "🦉", "🎨", "🚀", "🍕", "🥑", "⚽", "🎯"];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi (हिंदी)" },
  { code: "mr", label: "Marathi (मराठी)" },
];

const RADIUS_OPTIONS = [1, 3, 5, 10];

export default function UserOnboard() {
  const nav = useNavigate();
  const { user, refreshUser, setArea, showToast, signOut } = useApp();

  // 1. Necessary / Required Setup Fields
  const [name, setName] = useState(
    user.name && user.name !== "New user" ? user.name : ""
  );
  const defaultAlias =
    user.alias ||
    (user.name && user.name !== "New user"
      ? user.name.toLowerCase().replace(/[^a-z0-9_]/g, "")
      : "");
  const [alias, setAlias] = useState(defaultAlias);

  // Location setup
  const [areaInput, setAreaInput] = useState(user.area || "");
  const [lat, setLat] = useState(user.lat || 0);
  const [lng, setLng] = useState(user.lng || 0);
  const [locating, setLocating] = useState(false);
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoPlace[]>([]);

  // 2. Optional Settings & Preferences
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [language, setLanguage] = useState(user.language || "en");
  const [radius, setRadius] = useState(user.notificationRadiusKm || 5);
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");
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
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast("File too large — please pick a photo under 5 MB");
      return;
    }

    setUploading(true);
    try {
      const url = await uploadService.upload(file, "avatar");
      setAvatar(url);
      await userService.update({ avatar: url });
      await refreshUser();
      showToast("Profile picture uploaded!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showToast(msg);
    } finally {
      setUploading(false);
    }
  }

  async function searchPlaces(q: string) {
    setLocQuery(q);
    if (q.trim().length < 2) {
      setLocResults([]);
      return;
    }
    try {
      setLocResults(await forwardGeocode(q));
    } catch {
      /* ignore */
    }
  }

  function pickPlace(p: GeoPlace) {
    setLat(p.lat);
    setLng(p.lng);
    setAreaInput(p.area);
    setLocQuery("");
    setLocResults([]);
    showToast(`Picked location: ${p.area}`);
  }

  async function getGPSLocation() {
    if (!navigator.geolocation) {
      showToast("GPS not available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        try {
          const areaName = await reverseGeocode(latitude, longitude);
          if (areaName) setAreaInput(areaName);
          showToast("Location updated with GPS coords ✓");
        } catch {
          showToast("GPS coords set. Reverse geocoding failed.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        showToast("GPS access denied");
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
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

    let resolvedLat = lat;
    let resolvedLng = lng;
    if (areaInput.trim() && (lat === 0 || lng === 0)) {
      try {
        const places = await forwardGeocode(areaInput.trim());
        if (places.length > 0) {
          resolvedLat = places[0].lat;
          resolvedLng = places[0].lng;
        }
      } catch {
        /* ignore */
      }
    }

    setSaving(true);
    try {
      await userService.update({
        name: trimmedName,
        alias: trimmedAlias,
        area: areaInput.trim() || undefined,
        lat: resolvedLat || undefined,
        lng: resolvedLng || undefined,
        avatar: avatar || undefined,
        phone: phone || undefined,
        language,
        notificationRadiusKm: radius,
        emergencyContact: emergencyPhone || undefined,
        emergencyContactName: emergencyName || undefined,
      });

      if (areaInput.trim()) setArea(areaInput.trim());
      localStorage.setItem("settings_radius", String(radius));
      localStorage.setItem("locationPromptShown", "true");
      await refreshUser();
      showToast("Account setup complete!");
      nav("/home");
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
            Welcome to STRYT
          </h1>
          <p style={{ marginTop: 6, fontSize: 14, color: "var(--ink-600)", maxWidth: 300, margin: "6px auto 0" }}>
            Let's set up your account details and local preferences.
          </p>
        </div>

        {/* ── 1. Necessary Account Setup Card (REQUIRED *) ── */}
        <div
          style={{
            width: "100%",
            background: "#fff",
            border: "1.5px solid var(--brand-300)",
            borderRadius: 24,
            padding: 24,
            boxShadow: "0 8px 24px rgba(124, 58, 237, 0.08)",
            marginBottom: 20,
          }}
        >
          <div className="row gap-8" style={{ marginBottom: 18, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 900, background: "var(--brand-600)", color: "#fff", padding: "4px 10px", borderRadius: 8, letterSpacing: 0.5 }}>
              NECESSARY SETUP *
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
          <div className="field" style={{ marginBottom: 20 }}>
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

          {/* Location Area Field */}
          <div className="field">
            <div className="row space-between" style={{ marginBottom: 6, alignItems: "center" }}>
              <label style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-700)" }}>
                Neighborhood / Area Location
              </label>
              <button
                type="button"
                onClick={getGPSLocation}
                disabled={locating}
                className="row center gap-4"
                style={{ background: "none", border: "none", color: "var(--brand-600)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {locating ? <Loader className="spin" size={12} /> : <Navigation size={12} />} GPS Auto
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <input
                type="text"
                className="input"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 38px",
                  fontSize: 15,
                  background: "var(--ink-50)",
                  border: "1.5px solid var(--ink-200)",
                  borderRadius: 14,
                  color: "var(--ink-900)",
                }}
                placeholder="e.g. Amanora Park Town, Pune"
                value={locQuery || areaInput}
                onChange={(e) => {
                  setAreaInput(e.target.value);
                  void searchPlaces(e.target.value);
                }}
              />
              <MapPin size={16} color="var(--brand-600)" style={{ position: "absolute", left: 12, top: 14 }} />
              {locQuery && (
                <button
                  type="button"
                  onClick={() => { setLocQuery(""); setLocResults([]); }}
                  style={{ position: "absolute", right: 12, top: 12, background: "none", border: "none", cursor: "pointer" }}
                >
                  <X size={16} color="var(--ink-400)" />
                </button>
              )}
            </div>

            {/* Location Search Results dropdown */}
            {locResults.length > 0 && (
              <div
                className="card"
                style={{
                  marginTop: 6,
                  padding: 4,
                  maxHeight: 180,
                  overflowY: "auto",
                  border: "1.5px solid var(--brand-300)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {locResults.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    className="row gap-8 center-v"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                    onClick={() => pickPlace(p)}
                  >
                    <MapPin size={14} color="var(--brand-600)" style={{ flexShrink: 0 }} />
                    <span className="small bold truncate">{p.area}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Optional Settings & Preferences Card (OPTIONAL) ── */}
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
          <div className="row gap-8" style={{ marginBottom: 20, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 800, background: "var(--ink-100)", color: "var(--ink-600)", padding: "4px 10px", borderRadius: 8, letterSpacing: 0.5 }}>
              OPTIONAL SETTINGS & PREFERENCES
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
            <span style={{ fontSize: 12, color: "var(--ink-500)" }}>Profile Photo (Optional)</span>

            {/* Emoji Quick Picker */}
            <div className="col gap-6" style={{ width: "100%", marginTop: 4 }}>
              <span className="tiny semi" style={{ color: "var(--ink-500)", textAlign: "center" }}>Or pick an avatar emoji:</span>
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
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional Mobile Phone */}
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
                fontSize: 15,
                background: "var(--ink-50)",
                border: "1.5px solid var(--ink-200)",
                borderRadius: 14,
                color: "var(--ink-900)",
              }}
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              disabled={saving}
              maxLength={10}
            />
          </div>

          {/* Language & Notification Radius preferences */}
          <div className="row gap-12" style={{ marginBottom: 20 }}>
            <div className="field grow">
              <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6, fontWeight: 700, fontSize: 13, color: "var(--ink-700)" }}>
                <Globe size={13} color="var(--brand-600)" /> Language
              </label>
              <select
                className="input"
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: 14,
                  background: "var(--ink-50)",
                  border: "1.5px solid var(--ink-200)",
                  borderRadius: 14,
                  color: "var(--ink-900)",
                }}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8, fontWeight: 700, fontSize: 13, color: "var(--ink-700)" }}>
              <Sliders size={13} color="var(--brand-600)" /> Alert Radius: <span style={{ color: "var(--brand-700)", marginLeft: 4 }}>{radius} km</span>
            </label>
            <div className="row gap-8" style={{ flexWrap: "wrap" }}>
              {RADIUS_OPTIONS.map((r) => {
                const active = radius === r && !showCustom;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setRadius(r); setShowCustom(false); }}
                    style={{
                      flex: "1 0 calc(20% - 8px)",
                      padding: "8px 0",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      border: active ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)",
                      background: active ? "var(--brand-50)" : "var(--ink-50)",
                      color: active ? "var(--brand-700)" : "var(--ink-700)",
                      cursor: "pointer"
                    }}
                  >
                    {r} km
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const isCustomActive = !RADIUS_OPTIONS.includes(radius);
                  setCustomVal(isCustomActive ? String(radius) : "");
                  setShowCustom(true);
                }}
                style={{
                  flex: "1 0 calc(20% - 8px)",
                  padding: "8px 0",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  border: showCustom || !RADIUS_OPTIONS.includes(radius) ? "2px solid var(--brand-600)" : "1px solid var(--ink-200)",
                  background: showCustom || !RADIUS_OPTIONS.includes(radius) ? "var(--brand-50)" : "var(--ink-50)",
                  color: showCustom || !RADIUS_OPTIONS.includes(radius) ? "var(--brand-700)" : "var(--ink-700)",
                  cursor: "pointer"
                }}
              >
                Custom
              </button>
            </div>
            {showCustom && (
              <div className="row gap-8" style={{ marginTop: 10 }}>
                <input
                  type="number"
                  step="0.1"
                  className="input grow"
                  style={{ padding: "8px 12px", fontSize: 13, height: 36 }}
                  placeholder="Radius in km..."
                  value={customVal}
                  onChange={(e) => setCustomVal(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ height: 36, padding: "0 12px" }}
                  onClick={() => {
                    const n = parseFloat(customVal);
                    if (!isNaN(n) && n > 0) {
                      const rounded = Math.round(n * 10) / 10;
                      setRadius(rounded);
                    }
                    setShowCustom(false);
                  }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ height: 36, padding: "0 12px" }}
                  onClick={() => setShowCustom(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--ink-100)", margin: "20px 0" }} />

          {/* Emergency Contacts Section */}
          <div className="col gap-12">
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red-500)", display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldAlert size={14} /> Emergency Contact (Optional / Safety)
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
              <Loader className="spin" size={18} /> Saving Account Setup...
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
