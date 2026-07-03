import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, MapPin, Navigation, Loader, Search, X, User, Phone, AlertTriangle, Lock } from "lucide-react";
import { useApp } from "@/store";
import { userService, uploadService } from "@/services";
import { AppBar } from "@/components/common";
import { reverseGeocode, forwardGeocode, type GeoPlace } from "@/lib/geocode";

const PRIVACY_FIELDS: { key: "showPostsPublicly" | "showAsksPublicly" | "showBadgesPublicly" | "showPhonePublicly" | "showCityPublicly" | "showRatingPublicly"; label: string; hint: string }[] = [
  { key: "showPostsPublicly", label: "Community posts", hint: "Your posts on your public profile" },
  { key: "showAsksPublicly", label: "Service requests", hint: "Your asks/requests on your public profile" },
  { key: "showBadgesPublicly", label: "Trust badges", hint: "Earned badges & verifications" },
  { key: "showPhonePublicly", label: "Phone number", hint: "Lets others call you from your public profile" },
  { key: "showCityPublicly", label: "Neighborhood", hint: "Your area/city on your public profile" },
  { key: "showRatingPublicly", label: "Rating", hint: "Your star rating on your public profile" },
];

export default function ProfileEdit() {
  const nav = useNavigate();
  const { user, refreshUser, setArea, showToast } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName]       = useState(user.name || "");
  const [avatar, setAvatar]   = useState(user.avatar || "");
  const [phone, setPhone]     = useState(user.phone || "");
  const [areaInput, setAreaInput] = useState(user.area || "");
  const [lat, setLat]         = useState(user.lat || 0);
  const [lng, setLng]         = useState(user.lng || 0);
  const [ecName, setEcName]   = useState(user.emergencyContactName || "");
  const [ecPhone, setEcPhone] = useState(user.emergencyContact || "");

  const [privacy, setPrivacy] = useState({
    showPostsPublicly: user.showPostsPublicly !== false,
    showAsksPublicly: user.showAsksPublicly !== false,
    showBadgesPublicly: user.showBadgesPublicly !== false,
    showPhonePublicly: user.showPhonePublicly !== false,
    showCityPublicly: user.showCityPublicly !== false,
    showRatingPublicly: user.showRatingPublicly !== false,
  });

  const [uploading, setUploading] = useState(false);
  const [locating, setLocating]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  // Location search state
  const [locQuery, setLocQuery]     = useState("");
  const [locResults, setLocResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching]   = useState(false);

  async function searchPlaces(q: string) {
    setLocQuery(q);
    if (q.trim().length < 2) { setLocResults([]); return; }
    setSearching(true);
    try { setLocResults(await forwardGeocode(q)); } catch { /* ignore */ }
    finally { setSearching(false); }
  }

  function pickPlace(p: GeoPlace) {
    setLat(p.lat); setLng(p.lng); setAreaInput(p.area);
    setLocQuery(""); setLocResults([]);
    showToast(`Picked location: ${p.area}`);
  }

  async function getGPSLocation() {
    if (!navigator.geolocation) { showToast("GPS not available on this device"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude); setLng(longitude);
        try {
          const areaName = await reverseGeocode(latitude, longitude);
          if (areaName) setAreaInput(areaName);
          showToast("Location updated with GPS coords ✓");
        } catch { showToast("GPS coords set. Reverse geocoding failed."); }
        finally { setLocating(false); }
      },
      () => { setLocating(false); showToast("GPS access denied"); },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    // Client-side size guard (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("File too large — please pick a photo under 5 MB");
      return;
    }

    // Show an instant local preview so the user sees feedback immediately
    const blobUrl = URL.createObjectURL(file);
    setLocalPreview(blobUrl);

    setUploading(true);
    try {
      const url = await uploadService.upload(file, "avatar");
      setAvatar(url);
      await userService.update({ avatar: url });
      await refreshUser();
      showToast("Photo uploaded ✓");
    } catch (err: any) {
      setLocalPreview(null);
      showToast(err?.message || "Photo upload failed — check your connection");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (saving) return;
    if (!name.trim()) { showToast("Name is required"); return; }
    let resolvedLat = lat;
    let resolvedLng = lng;
    if (areaInput.trim() && areaInput.trim() !== user.area && (lat === 0 || lat === user.lat)) {
      try {
        const places = await forwardGeocode(areaInput.trim());
        if (places.length > 0) { resolvedLat = places[0].lat; resolvedLng = places[0].lng; }
      } catch { /* ignore */ }
    }
    setSaving(true);
    try {
      await userService.update({
        name: name.trim(),
        phone: phone.trim() || undefined, avatar: avatar || undefined,
        area: areaInput.trim() || undefined, lat: resolvedLat, lng: resolvedLng,
        emergencyContactName: ecName.trim() || undefined,
        emergencyContact: ecPhone.trim() || undefined,
        ...privacy,
      });
      if (areaInput.trim()) setArea(areaInput.trim());
      await refreshUser();
      showToast("Profile saved ✓");
      nav("/profile");
    } catch { showToast("Couldn't save profile changes"); }
    finally { setSaving(false); }
  }

  /* ── Reusable section header with icon ── */
  function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "var(--brand-50, #eef2ff)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--ink-500)", letterSpacing: "0.9px", textTransform: "uppercase" }}>
          {title}
        </span>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="Edit Profile" />
      <div className="screen-scroll page-pad col gap-20" style={{ paddingBottom: 100 }}>

        {/* ── Avatar upload ── */}
        <div style={{
          background: "linear-gradient(135deg, var(--brand-50, #eef2ff) 0%, var(--ink-50) 100%)",
          borderRadius: 20, padding: "26px 16px 20px",
          display: "flex", flexDirection: "column", alignItems: "center",
          marginTop: 8, border: "1.5px solid var(--ink-100)",
        }}>
          <div style={{ position: "relative", width: 92, height: 92 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={handleAvatarChange}
            />
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              style={{ cursor: uploading ? "default" : "pointer" }}
            >
              {(localPreview || avatar) ? (
                <img
                  src={localPreview ?? avatar}
                  alt="Profile"
                  style={{
                    width: 92, height: 92, borderRadius: "50%", objectFit: "cover",
                    border: "3px solid var(--brand-500)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  }}
                />
              ) : (
                <div style={{
                  width: 92, height: 92, borderRadius: "50%",
                  background: "var(--ink-100)", fontSize: 36, color: "var(--ink-400)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "3px solid var(--ink-200)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                }}>
                  👤
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                position: "absolute", bottom: 0, right: 0,
                background: "var(--brand-600)", color: "#fff",
                width: 30, height: 30, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", border: "2.5px solid #fff",
                boxShadow: "0 3px 8px rgba(0,0,0,0.18)",
                pointerEvents: uploading ? "none" : "auto",
              }}
            >
              {uploading
                ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
                : <Camera size={14} />
              }
            </button>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              marginTop: 14, padding: "7px 22px",
              background: "var(--brand-600)", color: "#fff",
              borderRadius: 20, fontSize: 12.5, fontWeight: 700,
              border: "none", cursor: "pointer", opacity: uploading ? 0.65 : 1,
            }}
          >
            {uploading ? "Uploading…" : "Change photo"}
          </button>
          <span style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 6 }}>JPG or PNG · max 5 MB</span>
        </div>

        {/* ── Personal info ── */}
        <div>
          <SectionHead icon={<User size={15} color="var(--brand-600)" />} title="Personal info" />
          <div className="col gap-12">
            <div className="field">
              <label>
                Display Name <span style={{ color: "var(--red-500)" }}>*</span>
              </label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>

          </div>
        </div>

        {/* ── Privacy ── */}
        <div>
          <SectionHead icon={<Lock size={15} color="var(--brand-600)" />} title="Privacy" />
          <div style={{
            background: "#fff", border: "1.5px solid var(--ink-200)",
            borderRadius: 16, overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <p className="tiny muted" style={{ padding: "12px 14px 0" }}>
              Choose what neighbors see on your public profile. This doesn't affect what you see yourself.
            </p>
            {PRIVACY_FIELDS.map((f, i) => (
              <div
                key={f.key}
                className="row between center-v"
                style={{ padding: "12px 14px", borderTop: i > 0 ? "1px solid var(--line)" : "none", marginTop: i === 0 ? 10 : 0 }}
              >
                <div>
                  <div className="semi small">{f.label}</div>
                  <div className="tiny muted">{f.hint}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPrivacy((p) => ({ ...p, [f.key]: !p[f.key] }))}
                  style={{
                    width: 44, height: 26, borderRadius: 999, flexShrink: 0,
                    background: privacy[f.key] ? "var(--brand-600)" : "var(--ink-200)",
                    position: "relative", border: "none", cursor: "pointer",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 3, left: privacy[f.key] ? 21 : 3,
                    width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s",
                  }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Contact ── */}
        <div>
          <SectionHead icon={<Phone size={15} color="var(--brand-600)" />} title="Contact" />
          <div className="field">
            <label>Main Mobile Number</label>
            <input
              className="input"
              placeholder="10-digit number"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>

        {/* ── Location / Neighbourhood ── */}
        <div>
          <SectionHead icon={<MapPin size={15} color="var(--brand-600)" />} title="Neighbourhood" />
          <div style={{
            background: "#fff", border: "1.5px solid var(--ink-200)",
            borderRadius: 16, overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            {/* Current area input */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MapPin size={16} color="var(--brand-700)" style={{ flexShrink: 0 }} />
                <input
                  className="input"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  style={{ border: "none", padding: 0, background: "transparent", fontWeight: 600, fontSize: 14, flex: 1 }}
                  placeholder="Your neighbourhood area"
                />
              </div>
              {lat && lng ? (
                <span style={{ fontSize: 10, color: "var(--ink-400)", marginTop: 4, display: "block", paddingLeft: 24 }}>
                  {lat.toFixed(5)}°, {lng.toFixed(5)}°
                </span>
              ) : null}
            </div>

            {/* GPS */}
            <button
              type="button"
              disabled={locating}
              onClick={getGPSLocation}
              style={{
                width: "100%", padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 10,
                background: locating ? "var(--ink-50)" : "#fff",
                borderBottom: "1px solid var(--line)",
                color: "var(--brand-700)", fontWeight: 600, fontSize: 13.5,
                cursor: "pointer", border: "none",
              }}
            >
              {locating
                ? <Loader size={15} style={{ animation: "spin 1s linear infinite" }} />
                : <Navigation size={15} />
              }
              {locating ? "Getting your location…" : "Use current GPS location"}
            </button>

            {/* Search input */}
            <div style={{ padding: "10px 14px", borderBottom: locResults.length > 0 ? "1px solid var(--line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--ink-50)", borderRadius: 10, padding: "0 10px" }}>
                <Search size={14} color="var(--ink-400)" />
                <input
                  className="input"
                  style={{ border: "none", padding: "9px 0", fontSize: 13, background: "transparent", flex: 1 }}
                  placeholder="Search for your area..."
                  value={locQuery}
                  onChange={(e) => void searchPlaces(e.target.value)}
                />
                {searching && <Loader size={12} style={{ animation: "spin 1s linear infinite", color: "var(--ink-400)" }} />}
                {locQuery && (
                  <button
                    type="button"
                    onClick={() => { setLocQuery(""); setLocResults([]); }}
                    style={{ border: "none", background: "none", color: "var(--ink-400)", cursor: "pointer", padding: 2 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Location results */}
            {locResults.length > 0 && (
              <div>
                {locResults.map((p, i) => (
                  <button
                    key={`${p.lat},${p.lng}`}
                    type="button"
                    onClick={() => pickPlace(p)}
                    style={{
                      width: "100%", padding: "10px 14px",
                      display: "flex", alignItems: "center", gap: 10,
                      borderBottom: i < locResults.length - 1 ? "1px solid var(--line)" : "none",
                      textAlign: "left", cursor: "pointer", background: "#fff", border: "none",
                    }}
                  >
                    <MapPin size={14} color="var(--brand-600)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.area}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.full}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Emergency contact ── */}
        <div>
          <SectionHead icon={<AlertTriangle size={15} color="var(--red-500)" />} title="Emergency contact" />
          <div style={{
            background: "#fff", border: "1.5px solid #fee2e2",
            borderRadius: 16, padding: 16,
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}>
            <div className="col gap-12">
              <div className="field">
                <label style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Contact person name</label>
                <input
                  className="input"
                  placeholder="e.g. Spouse, Partner, Parent"
                  value={ecName}
                  onChange={(e) => setEcName(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Mobile number</label>
                <input
                  className="input"
                  placeholder="10-digit number"
                  inputMode="numeric"
                  maxLength={10}
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value.replace(/\D/g, ""))}
                  style={{ marginTop: 4 }}
                />
              </div>
            </div>
            <div style={{
              marginTop: 14, padding: "10px 12px",
              background: "#fff5f5", borderRadius: 10,
              fontSize: 11.5, color: "#b91c1c", lineHeight: 1.55,
            }}>
              🔒 Only used if you trigger SOS during an active agreement. Always kept completely private.
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky save footer ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "#fff",
        borderTop: "1px solid var(--line)",
        padding: "12px 16px",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        zIndex: 100,
        boxShadow: "0 -4px 18px rgba(0,0,0,0.06)",
      }}>
        <button
          type="button"
          className="btn btn-primary btn-block row center gap-8"
          disabled={saving || uploading}
          onClick={handleSave}
          style={{ height: 50, fontSize: 15, fontWeight: 700, borderRadius: 14 }}
        >
          {saving ? <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {saving ? "Saving Changes…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}