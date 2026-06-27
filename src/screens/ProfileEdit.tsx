import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, MapPin, Navigation, Loader, Search, X } from "lucide-react";
import { useApp } from "@/store";
import { userService, uploadService } from "@/services";
import { AppBar } from "@/components/common";
import { reverseGeocode, forwardGeocode, type GeoPlace } from "@/lib/geocode";

export default function ProfileEdit() {
  const nav = useNavigate();
  const { user, refreshUser, setArea, showToast } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user.name || "");
  const [alias, setAlias] = useState(user.alias || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [areaInput, setAreaInput] = useState(user.area || "");
  const [lat, setLat] = useState(user.lat || 0);
  const [lng, setLng] = useState(user.lng || 0);
  const [ecName, setEcName] = useState(user.emergencyContactName || "");
  const [ecPhone, setEcPhone] = useState(user.emergencyContact || "");

  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Suggestions search state
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);

  async function searchPlaces(q: string) {
    setLocQuery(q);
    if (q.trim().length < 2) {
      setLocResults([]);
      return;
    }
    setSearching(true);
    try {
      setLocResults(await forwardGeocode(q));
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
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
          if (areaName) {
            setAreaInput(areaName);
          }
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

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadService.upload(file, "avatar");
      setAvatar(url);
      showToast("Photo uploaded successfully!");
    } catch {
      showToast("Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (saving) return;
    if (!name.trim()) {
      showToast("Name is required");
      return;
    }
    let resolvedLat = lat;
    let resolvedLng = lng;

    if (areaInput.trim() && areaInput.trim() !== user.area && (lat === 0 || lat === user.lat)) {
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
        name: name.trim(),
        alias: alias.trim() || undefined,
        phone: phone.trim() || undefined,
        avatar: avatar || undefined,
        area: areaInput.trim() || undefined,
        lat: resolvedLat,
        lng: resolvedLng,
        emergencyContactName: ecName.trim() || undefined,
        emergencyContact: ecPhone.trim() || undefined,
      });
      if (areaInput.trim()) {
        setArea(areaInput.trim());
      }
      await refreshUser();
      showToast("Profile saved ✓");
      nav("/profile");
    } catch {
      showToast("Couldn't save profile changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="Edit Profile" />
      <div className="screen-scroll page-pad col gap-16" style={{ paddingBottom: 100 }}>
        {/* Photo Selection */}
        <div className="col center" style={{ margin: "16px 0" }}>
          <div style={{ position: "relative", width: 90, height: 90 }}>
            {avatar ? (
              <img
                src={avatar}
                alt="Profile"
                style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover", border: "2.5px solid var(--brand-500)" }}
              />
            ) : (
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: "50%",
                  background: "var(--ink-100)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32,
                  color: "var(--ink-400)",
                  border: "2px solid var(--ink-200)"
                }}
              >
                👤
              </div>
            )}
            <label
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                background: "var(--brand-600)",
                color: "#fff",
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                border: "2px solid #fff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                pointerEvents: uploading ? "none" : "auto"
              }}
            >
              {uploading ? <Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Camera size={13} />}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={handleAvatarChange}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 8, color: "var(--brand-700)", fontWeight: 700, fontSize: 12.5 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Change profile photo
          </button>
        </div>

        {/* Basic Fields */}
        <div className="field">
          <label>Display Name *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

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

        <div className="field">
          <label>Public Handle / Alias</label>
          <input
            className="input"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="e.g. SunnyResident"
          />
          <span className="tiny muted" style={{ marginTop: 4, display: "block" }}>
            This is the name neighbors see on your public posts, comments, and requests. Your real name stays private until you agree to a deal.
          </span>
        </div>

        {/* Location Section */}
        <div className="field">
          <label>Location / Neighborhood</label>
          <div className="card col gap-10" style={{ padding: 14, background: "var(--ink-50)", border: "1.5px solid var(--ink-200)" }}>
            <div className="row gap-8">
              <MapPin size={18} color="var(--brand-700)" style={{ flexShrink: 0 }} />
              <input
                className="input grow"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                style={{ border: "none", padding: 0, background: "transparent", fontWeight: 600, fontSize: 14 }}
                placeholder="Your neighborhood area"
              />
            </div>
            {lat && lng ? (
              <span className="tiny muted" style={{ fontSize: 10 }}>
                Coordinates: {lat.toFixed(5)}°, {lng.toFixed(5)}°
              </span>
            ) : null}

            <div className="divider" style={{ margin: "4px 0" }} />

            <button
              type="button"
              className="btn btn-outline btn-block btn-sm row center gap-8"
              disabled={locating}
              onClick={getGPSLocation}
              style={{ background: "#fff" }}
            >
              {locating ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Navigation size={13} />}
              {locating ? "Locating…" : "Use current GPS location"}
            </button>

            <div className="divider" style={{ margin: "4px 0" }} />

            {/* Remote Location Search */}
            <div className="tiny semi muted">Search & select location</div>
            <div className="row gap-8" style={{ border: "1.5px solid var(--ink-200)", borderRadius: 10, padding: "0 10px", background: "#fff", alignItems: "center" }}>
              <Search size={14} color="var(--ink-400)" />
              <input
                className="input grow"
                style={{ border: "none", padding: "8px 0", fontSize: 13 }}
                placeholder="Type to search area..."
                value={locQuery}
                onChange={(e) => void searchPlaces(e.target.value)}
              />
              {searching && <Loader size={12} style={{ animation: "spin 1s linear infinite", color: "var(--ink-400)" }} />}
              {locQuery && (
                <button type="button" onClick={() => { setLocQuery(""); setLocResults([]); }} style={{ border: "none", background: "none", color: "var(--ink-400)", cursor: "pointer" }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {locResults.length > 0 && (
              <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                {locResults.map((p, i) => (
                  <button
                    key={`${p.lat},${p.lng}`}
                    type="button"
                    className="row gap-8"
                    style={{ padding: "8px 10px", textAlign: "left", borderBottom: i < locResults.length - 1 ? "1px solid var(--line)" : "none", background: "#fff" }}
                    onClick={() => pickPlace(p)}
                  >
                    <MapPin size={14} color="var(--brand-600)" style={{ flexShrink: 0 }} />
                    <div className="grow" style={{ overflow: "hidden" }}>
                      <div className="semi small" style={{ fontSize: 12.5 }}>{p.area}</div>
                      <div className="tiny muted ellipsis" style={{ fontSize: 10.5 }}>{p.full}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="field">
          <label>Emergency Contact</label>
          <div className="card col gap-10" style={{ padding: 14, background: "var(--ink-50)", border: "1.5px solid var(--ink-200)" }}>
            <div className="field">
              <label className="tiny semi muted">Contact Person Name</label>
              <input
                className="input"
                placeholder="e.g. Spouse, Partner, Parent"
                value={ecName}
                onChange={(e) => setEcName(e.target.value)}
                style={{ background: "#fff", marginTop: 4 }}
              />
            </div>
            <div className="field">
              <label className="tiny semi muted">Mobile Number</label>
              <input
                className="input"
                placeholder="10-digit number"
                inputMode="numeric"
                maxLength={10}
                value={ecPhone}
                onChange={(e) => setEcPhone(e.target.value.replace(/\D/g, ""))}
                style={{ background: "#fff", marginTop: 4 }}
              />
            </div>
            <span className="tiny muted">
              Your emergency contact is only used if you trigger SOS during active agreements. It is kept completely private otherwise.
            </span>
          </div>
        </div>
      </div>

      {/* Sticky footer action button */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid var(--line)", padding: 12, zIndex: 100 }}>
        <button
          type="button"
          className="btn btn-primary btn-block row center gap-8"
          disabled={saving || uploading}
          onClick={handleSave}
        >
          {saving ? <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {saving ? "Saving Changes…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
